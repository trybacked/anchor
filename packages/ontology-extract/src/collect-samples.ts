import type { DatasetProvider } from "@trybacked/core";
import { warehouseTableFqn } from "@trybacked/discovery";

export type DocTableSample = {
  table: string;
  columns: string[];
  rows: string[][];
};

const SAMPLE_LIMIT = 8;
const CONTENT_MAX_CHARS = 400;

function truncateCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value)
  )
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= CONTENT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, CONTENT_MAX_CHARS)}…`;
}

export async function collectProfileDatasetSamples(
  provider: DatasetProvider,
  tables: readonly { table: string; datasetId: string }[],
): Promise<DocTableSample[]> {
  if (provider.sample === undefined) {
    return [];
  }
  const samples: DocTableSample[] = [];
  for (const target of tables) {
    try {
      const sample = await provider.sample({ id: target.datasetId }, { limit: SAMPLE_LIMIT });
      samples.push({
        table: target.table,
        columns: sample.columns,
        rows: sample.rows.map((row) => row.map(truncateCell)),
      });
    } catch {
      continue;
    }
  }
  return samples;
}

export async function collectDocsTableSamples(
  provider: DatasetProvider,
  options: { catalog: string; schema: string; tables: readonly string[] },
): Promise<DocTableSample[]> {
  if (provider.sample === undefined) {
    return [];
  }
  const samples: DocTableSample[] = [];
  for (const table of options.tables) {
    const id = warehouseTableFqn(options.catalog, options.schema, table);
    try {
      const sample = await provider.sample({ id }, { limit: SAMPLE_LIMIT });
      samples.push({
        table,
        columns: sample.columns,
        rows: sample.rows.map((row) => row.map(truncateCell)),
      });
    } catch {
      continue;
    }
  }
  return samples;
}
