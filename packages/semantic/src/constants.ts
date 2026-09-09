export const ENTITY_MENTION_CONFIDENCE = 0.88;
export const IDENTIFIER_MENTION_CONFIDENCE = 0.92;
export const MENTION_MAX_NAME_WORDS = 6;
export const MENTION_MIN_NAME_CHARS = 4;
export const MENTION_MIN_WORD_CHARS = 2;
export const MENTION_ENTITY_ID_MAX_LENGTH = 80;
export const MENTION_ID_MAX_LENGTH = 120;
export const IDENTIFIER_CHARSET_PATTERNS = {
    alphanumeric: "[A-Z0-9]",
    numeric: "[0-9]",
    alphanumeric_dash: "[A-Z0-9-]",
} as const;
export const SUFFIX_MIN_LENGTH = 2;
export const SUFFIX_MAX_LENGTH = 6;
export const SUFFIX_MIN_DOCUMENTS = 2;
export const SUFFIX_MAX_RESULTS = 16;
export const REJECTED_NAME_SUFFIXES = new Set([
    "del",
    "dei",
    "della",
    "delle",
    "degli",
    "nel",
    "nella",
    "nelli",
    "nelle",
    "agli",
    "alla",
    "alle",
    "allo",
    "per",
    "non",
    "con",
    "tra",
    "fra",
    "via",
    "nido",
    "osta",
    "tue",
    "the",
    "and",
    "for",
    "com",
    "nn",
    "aa",
    "la",
    "al",
    "da",
    "di",
    "in",
    "su",
    "il",
    "lo",
    "le",
    "li",
    "un",
    "ecc",
    "che",
    "atto",
    "iva",
    "albo",
    "sole",
    "rup",
    "anac",
    "dgr",
    "dpgr",
    "dpr",
    "rtpa",
    "ddii",
]);
export const HEADER_MIN_SLUG_NUMBER_DIGITS = 4;
export const HEADER_MIN_SUBJECT_CHARS = 12;
export const HEADER_MAX_SUBJECT_CHARS = 200;
export const HEADER_ALL_CAPS_MIN_LETTERS = 8;
export const HEADER_OCR_MIN_ALPHANUMERIC_RATIO = 0.5;
export const BOILERPLATE_DOCUMENT_RATIO = 0.4;
export const BOILERPLATE_MIN_DOCUMENTS = 4;
export const DOCUMENT_ENRICHMENT_BATCH_SIZE = 20;
export const DOCUMENT_ENRICHMENT_CONCURRENCY = 4;
export const DOCUMENT_ENRICHMENT_MAX_TOPICS = 3;
export const DOCUMENT_ENRICHMENT_MAX_SUMMARY_CHARS = 240;
export const DOCUMENT_ENRICHMENT_MAX_SAMPLE_CHARS = 700;
export const DOCUMENT_ENRICHMENT_SAMPLE_LINE_LIMIT = 12;
export const ENTITY_ENRICHMENT_MAX_CONTEXT_SNIPPETS = 5;
export const ENTITY_ENRICHMENT_MAX_SNIPPET_CHARS = 200;
export const ENTITY_ENRICHMENT_MAX_SUMMARY_CHARS = 240;
export const MAX_BURST_ATTEMPTS = 3;
export const BURST_RETRY_DELAYS_MS = [0, 750, 2000] as const;
export const COLUMN_CLASSIFICATION_CONCURRENCY = 4;
export const RAW_FALLBACK_MAX_OUTPUT_TOKENS: Record<string, number> = {
    document_extraction: 8192,
    document_enrichment: 2048,
    entity_enrichment: 2048,
    column_classification: 4096,
    domain_vocabulary: 8192,
    ontology_proposal: 6144,
};
export const RAW_FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DOCUMENT_EXTRACTION_LLM_SKIP_CONFIDENCE = 0.85;
export const DOCUMENT_EXTRACTION_CONCURRENCY = 8;
export const DOCUMENT_EXTRACTION_BATCH_SIZE = 5;
export const ENTITY_ENRICHMENT_BATCH_SIZE = 20;
export const ENTITY_ENRICHMENT_CONCURRENCY = 4;
export const EMBEDDING_CONCURRENCY = 3;
export const DISCOVERY_DOCUMENT_SAMPLE = 12;
export const DISCOVERY_LINES_PER_DOCUMENT = 60;
export const DISCOVERY_MAX_CHARS = 24000;
export const LINE_DOCUMENT_ENTITY_CONFIDENCE = 0.95;
export const LINE_DOCUMENT_COLUMN_CONFIDENCE = 0.95;
export const ONTOLOGY_ENTITY_CONFIDENCE = 0.9;
export const ONTOLOGY_HIGH_CONFIDENCE = 0.95;
export const ONTOLOGY_PROFILE_CONFIDENCE = 0.98;
export const PIPELINE_METADATA_COLUMN_CONFIDENCE = 0.95;
export const PIPELINE_METADATA_DEFAULT_CONFIDENCE = 0.9;
export const DOCUMENT_CORPUS_LINE_TABLE_THRESHOLD = 15;
export const DOCUMENT_CORPUS_LINE_TABLE_RATIO = 0.8;
export const EMBEDDING_BATCH_SIZE = 32;
export const FACT_LINE_WINDOW = 25;
export const FACT_CUE_WINDOW_CHARS = 160;
export const FACT_PAGE_LINE_STRIDE = 1000;
export const COMPRESSED_TOP_VALUES_LIMIT = 5;
export const COMPRESSED_TOP_VALUE_MAX_LENGTH = 40;
