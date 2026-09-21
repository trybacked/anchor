import { quoteIdentifier } from "@backed/ingest";
import type { Dataset as IngestDataset, IngestSession, SqlQuery } from "@backed/ingest";
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

export type DuckDbDatasetProviderSource =
  | { kind: "session"; session: IngestSession }
  | { kind: "query"; query: SqlQuery; tableNames: string[] };

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

function resolveTables(source: DuckDbDatasetProviderSource): Array<{ id: string; sourceFile?: string }> {
  if (source.kind === "session") {
    return source.session.datasets.map((dataset: IngestDataset) => ({
      id: dataset.tableName,
      sourceFile: dataset.sourceFile,
    }));
  }
  return source.tableNames.map((tableName) => ({ id: tableName }));
}

function resolveQuery(source: DuckDbDatasetProviderSource): SqlQuery {
  return source.kind === "session" ? source.session.query : source.query;
}

export function createDuckDbDatasetProvider(source: DuckDbDatasetProviderSource): DatasetProvider {
  const tables = resolveTables(source);
  const query = resolveQuery(source);

  return {
    async listDatasets(): Promise<Dataset[]> {
      return tables.map((table) => ({
        id: table.id,
        name: table.id,
        ...(table.sourceFile !== undefined && table.sourceFile.length > 0
          ? { description: `Ingested from ${table.sourceFile}` }
          : {}),
      }));
    },

    async getSchema(dataset: DatasetIdentifier): Promise<DatasetSchema> {
      const table = quoteIdentifier(dataset.id);
      const describeRows = await query(`DESCRIBE ${table}`);
      const columns: DatasetColumn[] = describeRows.map((row) => ({
        name: String(row["column_name"]),
        type: String(row["column_type"]),
        nullable: String(row["null"] ?? "YES").toUpperCase() !== "NO",
      }));
      return { columns };
    },

    async getMetadata(dataset: DatasetIdentifier): Promise<DatasetMetadata> {
      const table = quoteIdentifier(dataset.id);
      const rows = await query(`SELECT COUNT(*) AS row_count FROM ${table}`);
      const tableMeta = tables.find((entry) => entry.id === dataset.id);
      return {
        rowCount: toCount(rows[0]?.["row_count"]),
        ...(tableMeta?.sourceFile !== undefined && tableMeta.sourceFile.length > 0
          ? { upstreamProvenance: tableMeta.sourceFile }
          : {}),
      };
    },

    async getStatistics(dataset: DatasetIdentifier): Promise<DatasetStatistics> {
      const schema = await this.getSchema(dataset);
      const table = quoteIdentifier(dataset.id);
      const columns: DatasetColumnStatistics[] = [];
      for (const column of schema.columns) {
        const col = quoteIdentifier(column.name);
        const statsRows = await query(`SELECT
          COUNT(*) - COUNT(${col}) AS null_count,
          COUNT(DISTINCT ${col}) AS distinct_count,
          MIN(${col})::VARCHAR AS min_value,
          MAX(${col})::VARCHAR AS max_value
        FROM ${table}`);
        const stats = statsRows[0];
        const minValue = stats?.["min_value"];
        const maxValue = stats?.["max_value"];
        const entry: DatasetColumnStatistics = {
          name: column.name,
          nullCount: toCount(stats?.["null_count"]),
          distinctCount: toCount(stats?.["distinct_count"]),
        };
        if (minValue !== null && minValue !== undefined) {
          entry.min = String(minValue);
        }
        if (maxValue !== null && maxValue !== undefined) {
          entry.max = String(maxValue);
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
      const table = quoteIdentifier(dataset.id);
      const columnList = selectedColumns.map((name) => quoteIdentifier(name)).join(", ");
      const rows = await query(`SELECT ${columnList} FROM ${table} LIMIT ${String(limit)}`);
      return {
        columns: selectedColumns,
        rows: rows.map((row) => selectedColumns.map((column) => row[column])),
      };
    },
  };
}

export async function listDuckDbTableNames(query: SqlQuery): Promise<string[]> {
  const rows = await query("SHOW TABLES");
  return rows
    .map((row) => String(row["name"]))
    .filter((name) => name.length > 0)
    .sort();
}
