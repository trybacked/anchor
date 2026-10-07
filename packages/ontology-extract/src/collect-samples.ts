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
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= CONTENT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, CONTENT_MAX_CHARS)}…`;
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
      // Sample all columns: column selection is binding-driven (Plan Fase 4),
      // not hardcoded per table name.
      const sample = await provider.sample({ id }, { limit: SAMPLE_LIMIT });
      samples.push({
        table,
        columns: sample.columns,
        rows: sample.rows.map((row) => row.map(truncateCell)),
      });
    } catch {
      // Table may exist in profile but be unreadable for sampling — skip quietly.
    }
  }
  return samples;
}
