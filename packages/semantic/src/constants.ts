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
    "the",
    "and",
    "for",
    "com",
    "org",
    "net",
    "inc",
    "ltd",
    "llc",
    "co",
    "plc",
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
export const LLM_CACHE_KEY_HEX_LENGTH = 16;
export const LLM_CACHE_FILE_SUFFIX = ".json";
export const LLM_SCHEMA_NAMES = {
    columnClassification: "column_classification",
    ontologyProposal: "ontology_proposal",
    ontologyEntities: "ontology_entities",
    ontologyRelations: "ontology_relations",
    documentExtraction: "document_extraction",
    documentEnrichment: "document_enrichment",
    entityEnrichment: "entity_enrichment",
    domainVocabulary: "domain_vocabulary",
} as const;
export const ONTOLOGY_SPLIT_TABLE_THRESHOLD = 2;
export const ONTOLOGY_SPLIT_DOCUMENT_TYPE_THRESHOLD = 4;
export type LlmSchemaName = (typeof LLM_SCHEMA_NAMES)[keyof typeof LLM_SCHEMA_NAMES];
export const STRICT_JSON_SUFFIX = "\n\nIMPORTANT: respond with ONLY the raw JSON object matching the schema. No markdown fences, no prose before or after, no trailing commas. Your entire response must be valid JSON.";
export const COLUMN_CLASSIFICATION_CONCURRENCY = 4;
export const RAW_FALLBACK_MAX_OUTPUT_TOKENS: Record<string, number> = {
    [LLM_SCHEMA_NAMES.documentExtraction]: 8192,
    [LLM_SCHEMA_NAMES.documentEnrichment]: 8192,
    [LLM_SCHEMA_NAMES.entityEnrichment]: 8192,
    [LLM_SCHEMA_NAMES.columnClassification]: 4096,
    [LLM_SCHEMA_NAMES.domainVocabulary]: 8192,
    [LLM_SCHEMA_NAMES.ontologyProposal]: 8192,
    [LLM_SCHEMA_NAMES.ontologyEntities]: 6144,
    [LLM_SCHEMA_NAMES.ontologyRelations]: 6144,
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
