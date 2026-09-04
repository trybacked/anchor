import { detectEncoding, sniffCsvDialect } from "./csv-dialect.js";
import { extractDocxLines } from "./docx.js";
import { PdfNoExtractableTextError } from "./errors.js";
import { registerLineTable } from "./line-table.js";
import { ocrPdfLines } from "./pdf-ocr.js";
import { isPopplerAvailable } from "./pdf-poppler.js";
import { extractPdfLines } from "./pdf.js";
import { quoteIdentifier, quoteString } from "./sql.js";
import type { SourceFile } from "./scan.js";
import { extractTextFileLines } from "./text.js";
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
    case "pdf":
      return registerPdf(query, source, tableName);
    case "text":
      return registerText(query, source, tableName);
    case "docx":
      return registerDocx(query, source, tableName);
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

async function registerLineDocument(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
  rows: Awaited<ReturnType<typeof extractPdfLines>>,
  extraWarnings: IngestWarning[] = [],
): Promise<Registration> {
  if (rows.length === 0) {
    throw new PdfNoExtractableTextError(source.relativePath);
  }

  await registerLineTable(query, tableName, rows);

  return {
    dataset: {
      tableName,
      sourceFile: source.relativePath,
      format: source.format,
    },
    warnings: extraWarnings,
  };
}

async function registerPdf(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
): Promise<Registration> {
  let rows = await extractPdfLines(source.absolutePath);
  const warnings: IngestWarning[] = [];

  if (rows.length === 0) {
    rows = await ocrPdfLines(source.absolutePath);
    if (rows.length > 0) {
      warnings.push({
        kind: "pdf_ocr_applied",
        file: source.relativePath,
        message: "Scanned PDF: text extracted with OCR",
      });
    } else if (ocrRequested() && !(await isPopplerAvailable())) {
      warnings.push({
        kind: "pdf_ocr_skipped",
        file: source.relativePath,
        message:
          "Scanned PDF: OCR skipped — install Poppler (pdftoppm), e.g. brew install poppler",
      });
    }
  }

  return registerLineDocument(query, source, tableName, rows, warnings);
}

async function registerText(
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
  const rows = await extractTextFileLines(source.absolutePath);
  return registerLineDocument(query, source, tableName, rows, warnings);
}

async function registerDocx(
  query: SqlQuery,
  source: SourceFile,
  tableName: string,
): Promise<Registration> {
  const rows = await extractDocxLines(source.absolutePath);
  return registerLineDocument(query, source, tableName, rows);
}

function ocrRequested(): boolean {
  const flag = process.env["BACKED_SKIP_OCR"]?.trim().toLowerCase();
  return flag !== "1" && flag !== "true" && flag !== "yes";
}
