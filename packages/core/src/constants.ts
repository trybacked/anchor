/** Semantic model.yaml format version written by Anchor pipelines. */
export const MODEL_FORMAT_VERSION = "1" as const;

/** Confidence below which model elements are flagged as low confidence. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** Default confidence threshold for surfacing human review questions. */
export const DEFAULT_REVIEW_CONFIDENCE_THRESHOLD = 0.95;

/** Default minimum relevance score for entity search results. */
export const DEFAULT_SEARCH_MIN_SCORE = 0.35;

/** Default row cap for API/MCP object queries (mode rows). */
export const DEFAULT_WAREHOUSE_ROW_LIMIT = 15;

/** Hard ceiling for warehouse row queries — must match compiler MAX_OBJECT_QUERY_LIMIT. */
export const MAX_WAREHOUSE_ROW_LIMIT = 1000;

/** Stricter row cap for LLM-generated plans before execution. */
export const SEMANTIC_CHAT_MAX_ROW_LIMIT = 50;
