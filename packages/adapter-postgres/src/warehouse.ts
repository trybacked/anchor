import type {
  Dataset,
  DatasetColumn,
  DatasetIdentifier,
  DatasetMetadata,
  DatasetProvider,
  DatasetSchema,
  DatasetStatistics,
  DatasetSample,
} from "@trybacked/core";
import type { SqlDialect, SqlExecutor, SqlRow } from "@trybacked/ports";
import { postgresDialect } from "@trybacked/compiler";
import type { Pool } from "pg";

/**
 * Postgres warehouse adapter (Plan Phase 3b).
 *
 * Implements the WarehouseConnector port on plain Postgres: `information_schema`
 * for introspection, parameterized SQL execution, and the shared Postgres
 * dialect. Engine-agnostic callers never touch `pg` directly.
 */

/** Translate compiler-style `:name` placeholders to positional `$n` bindings. */
export function translateNamedParameters(
  sql: string,
  parameters: Record<string, unknown> | unknown[] | undefined,
): { sql: string; values: unknown[] } {
  if (parameters === undefined || Array.isArray(parameters)) {
    return { sql, values: parameters ?? [] };
  }
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return { sql, values: [] };
  }
  let out = sql;
  const values: unknown[] = [];
  // Replace longest names first to avoid prefix collisions (p10 vs p1).
  const ordered = [...names].sort((a, b) => b.length - a.length);
  for (const name of ordered) {
    const placeholder = `:${name}`;
    if (!out.includes(placeholder)) {
      continue;
    }
    values.push(parameters[name]);
    const token = `$${String(values.length)}`;
    out = out.split(placeholder).join(token);
  }
  return { sql: out, values };
}

export function createPostgresSqlExecutor(pool: Pool): SqlExecutor {
  return {
    execute: async (sql, parameters) => {
      const { sql: translated, values } = translateNamedParameters(sql, parameters);
      const result = await pool.query(translated, values);
      return result.rows as SqlRow[];
    },
  };
}

const PG_TYPE_MAP: Record<string, DatasetColumn["type"]> = {
  "character varying": "string",
  varchar: "string",
  text: "string",
  integer: "integer",
  bigint: "integer",
  smallint: "integer",
  numeric: "decimal",
  "double precision": "float",
  real: "float",
  boolean: "boolean",
  date: "date",
  "timestamp with time zone": "datetime",
  "timestamp without time zone": "datetime",
  json: "json",
  jsonb: "json",
};

function mapPgType(pgType: string): string {
  return PG_TYPE_MAP[pgType.toLowerCase()] ?? "string";
}

function splitDatasetId(id: string): { schema: string; table: string } {
  const [schema, table] = id.split(".");
  if (schema === undefined || table === undefined) {
    throw new Error(`Postgres dataset id must be "schema.table", got "${id}"`);
  }
  return { schema, table };
}

const quotePgIdent = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`;

type PostgresConnectorOptions = {
  /** Restrict introspection to these schemas (defaults to all non-system). */
  schemas?: string[] | undefined;
};

async function fetchColumns(pool: Pool, schema: string, table: string): Promise<DatasetColumn[]> {
  const result = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table],
  );
  return result.rows.map((row) => ({
    name: row.column_name,
    type: mapPgType(row.data_type),
    nullable: row.is_nullable === "YES",
  }));
}

export function createPostgresDatasetProvider(
  pool: Pool,
  options: PostgresConnectorOptions = {},
): DatasetProvider {
  const excluded = new Set(["pg_catalog", "information_schema", "pg_toast"]);
  return {
    listDatasets: async () => {
      const result = await pool.query<{ table_schema: string; table_name: string }>(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name`,
      );
      const datasets: Dataset[] = [];
      for (const row of result.rows) {
        if (excluded.has(row.table_schema)) continue;
        if (options.schemas !== undefined && !options.schemas.includes(row.table_schema)) {
          continue;
        }
        datasets.push({ id: `${row.table_schema}.${row.table_name}`, name: row.table_name });
      }
      return datasets;
    },
    getSchema: async (dataset: DatasetIdentifier) => {
      const { schema, table } = splitDatasetId(dataset.id);
      const columns = await fetchColumns(pool, schema, table);
      return { columns } satisfies DatasetSchema;
    },
    getMetadata: async (dataset: DatasetIdentifier): Promise<DatasetMetadata> => {
      const { schema, table } = splitDatasetId(dataset.id);
      const result = await pool.query<{ reltuples: string }>(
        `SELECT reltuples::text AS reltuples FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2`,
        [schema, table],
      );
      const estimate = Number(result.rows[0]?.reltuples ?? "0");
      const metadata: DatasetMetadata = { upstreamProvenance: `postgres:${dataset.id}` };
      if (Number.isFinite(estimate) && estimate >= 0) {
        metadata.rowCount = estimate;
      }
      return metadata;
    },
    getStatistics: async (dataset: DatasetIdentifier): Promise<DatasetStatistics> => {
      const { schema, table } = splitDatasetId(dataset.id);
      const columns = await fetchColumns(pool, schema, table);
      const statistics = await Promise.all(
        columns.map(async (column) => {
          const result = await pool.query<{ null_count: string; distinct_count: string }>(
            `SELECT
               COUNT(*) FILTER (WHERE ${quotePgIdent(column.name)} IS NULL)::text AS null_count,
               COUNT(DISTINCT ${quotePgIdent(column.name)})::text AS distinct_count
             FROM ${quotePgIdent(schema)}.${quotePgIdent(table)}`,
          );
          return {
            name: column.name,
            nullCount: Number(result.rows[0]?.null_count ?? "0"),
            distinctCount: Number(result.rows[0]?.distinct_count ?? "0"),
          };
        }),
      );
      return { columns: statistics };
    },
    sample: async (dataset: DatasetIdentifier, sampleOptions): Promise<DatasetSample> => {
      const { schema, table } = splitDatasetId(dataset.id);
      const limit = Math.min(sampleOptions?.limit ?? 20, 1000);
      const columns = sampleOptions?.columns;
      const projection =
        columns !== undefined && columns.length > 0
          ? columns.map(quotePgIdent).join(", ")
          : "*";
      const result = await pool.query(
        `SELECT ${projection} FROM ${quotePgIdent(schema)}.${quotePgIdent(table)} LIMIT ${String(limit)}`,
      );
      const rows = result.rows as Record<string, unknown>[];
      const sampleColumns = columns ?? (rows[0] !== undefined ? Object.keys(rows[0]) : []);
      return {
        columns: sampleColumns,
        rows: rows.map((row) => sampleColumns.map((c) => row[c] ?? null)),
      };
    },
  };
}

export function createPostgresWarehouseConnector(
  pool: Pool,
  options: PostgresConnectorOptions = {},
): { provider: DatasetProvider; executor: SqlExecutor; dialect: SqlDialect } {
  return {
    provider: createPostgresDatasetProvider(pool, options),
    executor: createPostgresSqlExecutor(pool),
    dialect: postgresDialect,
  };
}