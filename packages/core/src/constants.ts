/** Semantic model.yaml format version written by Anchor pipelines. */
export const MODEL_FORMAT_VERSION = "1" as const;

/** Confidence below which model elements are flagged as low confidence. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** Default confidence threshold for surfacing human review questions. */
export const DEFAULT_REVIEW_CONFIDENCE_THRESHOLD = 0.95;

/** Default minimum relevance score for entity search results. */
export const DEFAULT_SEARCH_MIN_SCORE = 0.35;
