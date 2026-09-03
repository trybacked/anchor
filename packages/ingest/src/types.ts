export type DatasetFormat = "csv" | "xlsx" | "parquet" | "json";

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
  | "decimal_comma";

/** Segnalazione strutturata con provenienza — mai fallire in silenzio. */
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

/** Handle vivo sulla connessione DuckDB, consumato da @backed/profile. */
export interface IngestSession extends IngestResult {
  query: SqlQuery;
  close: () => void;
}
