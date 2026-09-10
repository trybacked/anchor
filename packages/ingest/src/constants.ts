import type { DatasetFormat } from "./types.js";

export const SOURCE_EXTENSION_FORMATS: Readonly<Record<string, DatasetFormat>> = {
    ".csv": "csv",
    ".tsv": "csv",
    ".xlsx": "xlsx",
    ".xls": "xlsx",
    ".parquet": "parquet",
    ".json": "json",
    ".jsonl": "json",
    ".pdf": "pdf",
    ".txt": "text",
    ".md": "text",
    ".log": "text",
    ".docx": "docx",
};

export const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar"]);
export const IGNORED_SOURCE_BASENAMES = new Set(["manifest.json"]);
export const ARCHIVE_TEMP_DIR_PREFIX = "backed-archive-";

export const DOCUMENT_HEADER_LINE_LIMIT = 20;
export const CORPUS_SAMPLE_LINE_LIMIT = 60;
export const DOCUMENT_TYPE_SAMPLE_TABLE_LIMIT = 3;

export const LINE_INSERT_BATCH_SIZE = 200;
export const CHUNK_EMBEDDING_STORE_BATCH_SIZE = 100;

export const ENCODING_PROBE_MAX_BYTES = 1024 * 1024;
export const UTF8_TAIL_TRIM_BYTES = 4;

export const DEFAULT_OCR_MAX_PAGES = 30;
export const DEFAULT_OCR_DPI = 150;
export const MIN_OCR_DPI = 72;
export const OCR_TEMP_DIR_PREFIX = "backed-pdf-ocr-";
export const OCR_STDERR_DRAIN_MS = 400;

export const CHUNK_SEARCH_OVERSAMPLE_FACTOR = 3;
export const KEYWORD_MIN_TOKEN_LENGTH = 3;
export const KEYWORD_STOPWORDS = new Set(["the", "and", "for", "del", "della", "che", "con", "per"]);

export const PDF_INGEST_NOISE_PATTERN =
    /Image too small to scale|Line cannot be recognized|(?:Warning:\s*)?TT:\s*undefined function/i;
