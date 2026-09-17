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
