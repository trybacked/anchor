import { detectEncoding, sniffCsvDialect } from "./csv-dialect.js";
import { quoteIdentifier, quoteString } from "./sql.js";
import type { SourceFile } from "./scan.js";
import type { Dataset, IngestWarning, SqlQuery } from "./types.js";

export interface Registration {
  dataset: Dataset;
  warnings: IngestWarning[];
}

export async function registerSource(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
): Promise<Registration> {
  switch (source.format) {
    case "csv":
      return registerCsv(query, source, tableName);
    case "xlsx":
      return registerWithReader(query, source, tableName, "read_xlsx");
    case "parquet":
      return registerWithReader(query, source, tableName, "read_parquet");
    case "json":
      return registerWithReader(query, source, tableName, "read_json_auto");
    default: {
      const _exhaustive: never = source.format;
      throw new Error(`Unsupported format: ${String(_exhaustive)}`);
    }
  }
}

async function registerCsv(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
): Promise<Registration> {
  const warnings: IngestWarning[] = [];

  const encoding = await detectEncoding(source.absolutePath);
  if (encoding === "latin-1") {
    warnings.push({
      kind: "non_utf8_encoding",
      file: source.relativePath,
      message:
        "Non-UTF-8 encoding detected (likely Windows-1252): read as Latin-1",
    });
  }

  const sniffed = await sniffCsvDialect(query, source.absolutePath, encoding);
  if (sniffed.dialect.delimiter === ";") {
    warnings.push({
      kind: "semicolon_delimiter",
      file: source.relativePath,
      message: 'Semicolon ";" delimiter detected (European CSV format)',
    });
  }
  if (sniffed.dialect.decimalSeparator === ",") {
    warnings.push({
      kind: "decimal_comma",
      file: source.relativePath,
      message: "Decimal comma detected: numeric values read with European locale",
    });
  }

  await query(
    `CREATE VIEW ${quoteIdentifier(tableName)} AS ${sniffed.readCsvClause}`,
  );

  return {
    dataset: {
      tableName,
      sourceFile: source.relativePath,
      format: source.format,
      csvDialect: sniffed.dialect,
    },
    warnings,
  };
}

async function registerWithReader(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
  readerFunction: "read_xlsx" | "read_parquet" | "read_json_auto",
): Promise<Registration> {
  await query(
    `CREATE VIEW ${quoteIdentifier(tableName)} AS FROM ${readerFunction}(${quoteString(source.absolutePath)})`,
  );
  return {
    dataset: {
      tableName,
      sourceFile: source.relativePath,
      format: source.format,
    },
    warnings: [],
  };
}
