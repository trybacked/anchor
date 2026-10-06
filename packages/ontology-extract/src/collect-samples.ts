import type { DatasetProvider } from "@trybacked/core";
import { warehouseTableFqn } from "@trybacked/discovery";

export type DocTableSample = {
  table: string;
  columns: string[];
  rows: string[][];
};

const SAMPLE_LIMIT = 8;
const CONTENT_MAX_CHARS = 400;

const TABLE_SAMPLE_COLUMNS: Record<string, readonly string[]> = {
  documents: ["document_id", "filename", "path"],
  document_pages: ["document_id", "page_number"],
  document_elements: ["document_id", "element_id", "content"],
  document_entities: ["document_id", "entity_type", "entity_value"],
  entity_profiles: ["entity_type", "entity_value", "mention_count"],
};

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
    const columns = TABLE_SAMPLE_COLUMNS[table];
    if (columns === undefined) {
      continue;
    }
    const id = warehouseTableFqn(options.catalog, options.schema, table);
    try {
      const sample = await provider.sample({ id }, { limit: SAMPLE_LIMIT, columns: [...columns] });
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
