/** Canonical DuckDB table names and document-type slug helpers. */
export const DOCUMENT_CHUNKS_TABLE = "document_chunks" as const;
export const DOCUMENT_LINES_TABLE = "document_lines" as const;
export const DOCUMENT_MENTIONS_TABLE = "document_mentions" as const;
export const DOCUMENT_ENTITIES_TABLE = "document_entities" as const;
export const DOCUMENT_FACTS_TABLE = "document_facts" as const;
export const ENTITY_PROFILES_TABLE = "entity_profiles" as const;
/** Prefix for per-document-type DuckDB tables. */
export const DOC_TYPE_TABLE_PREFIX = "doc_" as const;
/** Fallback slug when a document type cannot be classified. */
export const DOC_TYPE_UNKNOWN_SLUG = "unknown" as const;

/** DuckDB tables created by the document pipeline (excluding dynamic `doc_*` tables). */
export const PIPELINE_INFRA_DATASET_TABLE_NAMES = [
  DOCUMENT_LINES_TABLE,
  DOCUMENT_CHUNKS_TABLE,
  DOCUMENT_ENTITIES_TABLE,
  DOCUMENT_MENTIONS_TABLE,
  DOCUMENT_FACTS_TABLE,
  ENTITY_PROFILES_TABLE,
] as const;

/** Materialized document/entity tables tracked for incremental GC (no lines/chunks). */
export const PIPELINE_MATERIALIZED_DATASET_TABLE_NAMES = [
  DOCUMENT_ENTITIES_TABLE,
  DOCUMENT_MENTIONS_TABLE,
  DOCUMENT_FACTS_TABLE,
  ENTITY_PROFILES_TABLE,
] as const;

const PIPELINE_INFRA_DATASET_TABLE_SET = new Set<string>(PIPELINE_INFRA_DATASET_TABLE_NAMES);
const PIPELINE_MATERIALIZED_DATASET_TABLE_SET = new Set<string>(
  PIPELINE_MATERIALIZED_DATASET_TABLE_NAMES,
);

export function isDocumentTypeMaterializedTable(tableName: string): boolean {
  return tableName.startsWith(DOC_TYPE_TABLE_PREFIX);
}

export function isPipelineInfraDatasetTable(tableName: string): boolean {
  return isDocumentTypeMaterializedTable(tableName) || PIPELINE_INFRA_DATASET_TABLE_SET.has(tableName);
}

export function createPipelineMaterializedDatasetTableSet(): Set<string> {
  return new Set(PIPELINE_MATERIALIZED_DATASET_TABLE_SET);
}
