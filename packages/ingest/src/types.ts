export type DatasetFormat =
  | "csv"
  | "xlsx"
  | "parquet"
  | "json"
  | "pdf"
  | "text"
  | "docx";

export type CsvEncoding = "utf-8" | "latin-1";
export type DecimalSeparator = "." | ",";

export interface CsvDialect {
  delimiter: string;
  encoding: CsvEncoding;
  decimalSeparator: DecimalSeparator;
}

export type IngestWarningKind =
  | "unreadable_file"
  | "unsupported_format"
  | "non_utf8_encoding"
  | "semicolon_delimiter"
  | "decimal_comma"
  | "pdf_no_extractable_text"
  | "pdf_ocr_applied"
  | "pdf_ocr_skipped"
  | "archive_extracted";

/** Structured warning with provenance — never fail silently. */
export interface IngestWarning {
  kind: IngestWarningKind;
  file: string;
  message: string;
}

export interface Dataset {
  tableName: string;
  sourceFile: string;
  format: DatasetFormat;
  csvDialect?: CsvDialect;
}

export interface IngestResult {
  datasets: Dataset[];
  warnings: IngestWarning[];
}

export type SqlQuery = (sql: string) => Promise<Record<string, unknown>[]>;

/** Live handle on the DuckDB connection, consumed by @backed/profile. */
export interface IngestSession extends IngestResult {
  query: SqlQuery;
  close: () => void;
}
