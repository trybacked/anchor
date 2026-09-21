import type {
  Dataset,
  DatasetColumn,
  DatasetColumnStatistics,
  DatasetIdentifier,
  DatasetMetadata,
  DatasetProvider,
  DatasetSample,
  DatasetSchema,
  DatasetStatistics,
  SampleOptions,
} from "@trybacked/core";
import type { DatabricksProviderConfig } from "./config.js";
import type { DatabricksSqlClient, SqlRow } from "./sql-client.js";

function quoteIdentifier(part: string): string {
  return `\`${part.replace(/`/g, "``")}\``;
}

function splitDatasetId(id: string): { catalog?: string; schema?: string; table: string } {
  const parts = id.split(".").filter((part) => part.length > 0);
  if (parts.length >= 3) {
    const catalog = parts[0];
    const schema = parts[1];
    const table = parts.slice(2).join(".");
    return {
      ...(catalog !== undefined ? { catalog } : {}),
      ...(schema !== undefined ? { schema } : {}),
      table,
    };
  }
  if (parts.length === 2) {
    const schema = parts[0];
    const table = parts[1] ?? id;
    return {
      ...(schema !== undefined ? { schema } : {}),
      table,
    };
  }
  return { table: id };
}

function qualifyTable(id: string, config: DatabricksProviderConfig): string {
  const parsed = splitDatasetId(id);
  const catalog = parsed.catalog ?? config.catalog;
  const schema = parsed.schema ?? config.schema;
  const segments = [catalog, schema, parsed.table].filter(
    (segment): segment is string => segment !== undefined && segment.length > 0,
  );
  if (segments.length === 0) {
    throw new Error(
      `Cannot qualify table id "${id}" — set BACKED_DATABRICKS_CATALOG and BACKED_DATABRICKS_SCHEMA`,
    );
  }
  return segments.map(quoteIdentifier).join(".");
}

function cellText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function listTablesSql(config: DatabricksProviderConfig): string {
  if (config.catalog !== undefined && config.schema !== undefined) {
    return `SHOW TABLES IN ${quoteIdentifier(config.catalog)}.${quoteIdentifier(config.schema)}`;
  }
  if (config.schema !== undefined) {
    return `SHOW TABLES IN ${quoteIdentifier(config.schema)}`;
  }
  return "SHOW TABLES";
}

function tableNameFromShowRow(row: SqlRow): string | null {
  const candidates = ["tableName", "table_name", "table"];
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function datasetIdFromTable(table: string, config: DatabricksProviderConfig): string {
  if (table.includes(".")) {
    return table;
  }
  if (config.catalog !== undefined && config.schema !== undefined) {
    return `${config.catalog}.${config.schema}.${table}`;
  }
  if (config.schema !== undefined) {
    return `${config.schema}.${table}`;
  }
  return table;
}

export type CreateDatabricksDatasetProviderOptions = {
  config: DatabricksProviderConfig;
  client?: DatabricksSqlClient;
};

export function createDatabricksDatasetProvider(
  options: CreateDatabricksDatasetProviderOptions,
): DatasetProvider {
  const { config } = options;
  const client = options.client;

  async function execute(sql: string): Promise<SqlRow[]> {
    if (client === undefined) {
      throw new Error("Databricks SQL client is not configured");
    }
    return client.execute(sql);
  }

  return {
    async listDatasets(): Promise<Dataset[]> {
      const rows = await execute(listTablesSql(config));
      return rows
        .map((row) => tableNameFromShowRow(row))
        .filter((name): name is string => name !== null)
        .map((table) => {
          const id = datasetIdFromTable(table, config);
          return {
            id,
            name: table,
            description: `Databricks table ${id}`,
          };
        });
    },

    async getSchema(dataset: DatasetIdentifier): Promise<DatasetSchema> {
      const table = qualifyTable(dataset.id, config);
      const rows = await execute(`DESCRIBE TABLE ${table}`);
      const columns: DatasetColumn[] = rows
        .map((row) => {
          const name = cellText(row["col_name"] ?? row["column_name"] ?? row["name"]) ?? "";
          const type = cellText(row["data_type"] ?? row["column_type"] ?? row["type"]) ?? "string";
          if (name.length === 0 || name.startsWith("#")) {
            return null;
          }
          return {
            name,
            type,
            nullable: !(cellText(row["comment"]) ?? "").toLowerCase().includes("not null"),
          };
        })
        .filter((column): column is DatasetColumn => column !== null);
      return { columns };
    },

    async getMetadata(dataset: DatasetIdentifier): Promise<DatasetMetadata> {
      const table = qualifyTable(dataset.id, config);
      const rows = await execute(`SELECT COUNT(*) AS row_count FROM ${table}`);
      return {
        rowCount: toCount(rows[0]?.["row_count"]),
        upstreamProvenance: `databricks://${config.host}/${dataset.id}`,
        tags: {
          provider: "databricks",
          ...(config.catalog !== undefined ? { catalog: config.catalog } : {}),
          ...(config.schema !== undefined ? { schema: config.schema } : {}),
        },
      };
    },

    async getStatistics(dataset: DatasetIdentifier): Promise<DatasetStatistics> {
      const schema = await this.getSchema(dataset);
      const table = qualifyTable(dataset.id, config);
      const columns: DatasetColumnStatistics[] = [];
      for (const column of schema.columns) {
        const col = quoteIdentifier(column.name);
        const rows = await execute(`SELECT
          COUNT(*) - COUNT(${col}) AS null_count,
          COUNT(DISTINCT ${col}) AS distinct_count,
          CAST(MIN(${col}) AS STRING) AS min_value,
          CAST(MAX(${col}) AS STRING) AS max_value
        FROM ${table}`);
        const stats = rows[0];
        const entry: DatasetColumnStatistics = {
          name: column.name,
          nullCount: toCount(stats?.["null_count"]),
          distinctCount: toCount(stats?.["distinct_count"]),
        };
        const minValue = cellText(stats?.["min_value"]);
        const maxValue = cellText(stats?.["max_value"]);
        if (minValue !== undefined) {
          entry.min = minValue;
        }
        if (maxValue !== undefined) {
          entry.max = maxValue;
        }
        columns.push(entry);
      }
      return { columns };
    },

    async sample(dataset: DatasetIdentifier, options?: SampleOptions): Promise<DatasetSample> {
      const limit = options?.limit ?? 20;
      const schema = await this.getSchema(dataset);
      const selectedColumns =
        options?.columns !== undefined && options.columns.length > 0
          ? options.columns
          : schema.columns.map((column) => column.name);
      const table = qualifyTable(dataset.id, config);
      const columnList = selectedColumns.map(quoteIdentifier).join(", ");
      const rows = await execute(`SELECT ${columnList} FROM ${table} LIMIT ${String(limit)}`);
      return {
        columns: selectedColumns,
        rows: rows.map((row) => selectedColumns.map((column) => row[column])),
      };
    },
  };
}

export function createDatabricksDatasetProviderFromClient(
  config: DatabricksProviderConfig,
  client: DatabricksSqlClient,
): DatasetProvider {
  return createDatabricksDatasetProvider({ config, client });
}
