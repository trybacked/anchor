import { open } from "node:fs/promises";

import { quoteString } from "./sql.js";
import type { CsvDialect, CsvEncoding, SqlQuery } from "./types.js";

const ENCODING_PROBE_MAX_BYTES = 1024 * 1024;
// Un carattere UTF-8 occupa al più 4 byte: scartare la coda evita
// falsi positivi da caratteri troncati al limite del probe.
const UTF8_TAIL_TRIM_BYTES = 4;

// Solo i tipi frazionari cambiano quando lo sniffer usa la virgola decimale.
const FRACTIONAL_TYPE_PATTERN = /^(DOUBLE|FLOAT|DECIMAL)/;

export interface SniffedCsv {
  dialect: CsvDialect;
  /** `FROM read_csv(...)` con dialetto pinnato, generato da sniff_csv. */
  readCsvClause: string;
}

interface SniffRow {
  delimiter: string;
  fractionalColumnCount: number;
  readCsvClause: string;
}

export async function detectEncoding(filePath: string): Promise<CsvEncoding> {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const probeSize = Math.min(size, ENCODING_PROBE_MAX_BYTES);
    const buffer = Buffer.alloc(probeSize);
    await handle.read(buffer, 0, probeSize, 0);
    const probe =
      size > probeSize
        ? buffer.subarray(0, probeSize - UTF8_TAIL_TRIM_BYTES)
        : buffer;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(probe);
      return "utf-8";
    } catch {
      // Non UTF-8: nel mercato PMI italiano è quasi sempre Windows-1252,
      // che DuckDB legge come latin-1.
      return "latin-1";
    }
  } finally {
    await handle.close();
  }
}

export async function sniffCsvDialect(
  query: SqlQuery,
  filePath: string,
  encoding: CsvEncoding,
): Promise<SniffedCsv> {
  const defaultSniff = await sniffCsv(query, filePath, encoding, ".");
  const commaSniff = await sniffCsv(query, filePath, encoding, ",");

  if (defaultSniff === undefined && commaSniff === undefined) {
    throw new Error("sniff_csv non ha prodotto un dialetto valido");
  }

  // La virgola decimale è rilevata quando produce più colonne frazionarie
  // rispetto allo sniffing standard (dove restano VARCHAR).
  const useDecimalComma =
    commaSniff !== undefined &&
    (defaultSniff === undefined ||
      commaSniff.fractionalColumnCount > defaultSniff.fractionalColumnCount);

  const chosen = useDecimalComma ? commaSniff : defaultSniff;
  if (chosen === undefined) {
    throw new Error("sniff_csv non ha prodotto un dialetto valido");
  }

  return {
    dialect: {
      delimiter: chosen.delimiter,
      encoding,
      decimalSeparator: useDecimalComma ? "," : ".",
    },
    readCsvClause: chosen.readCsvClause,
  };
}

async function sniffCsv(
  query: SqlQuery,
  filePath: string,
  encoding: CsvEncoding,
  decimalSeparator: string,
): Promise<SniffRow | undefined> {
  const options = [
    quoteString(filePath),
    `encoding=${quoteString(encoding)}`,
    `decimal_separator=${quoteString(decimalSeparator)}`,
  ].join(", ");

  let rows: Record<string, unknown>[];
  try {
    rows = await query(`FROM sniff_csv(${options})`);
  } catch {
    // Lo sniffing con virgola decimale può fallire su file che quello
    // standard accetta: il chiamante sceglie tra i tentativi riusciti.
    return undefined;
  }

  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }

  const columns = Array.isArray(row["Columns"]) ? row["Columns"] : [];
  const fractionalColumnCount = columns.filter(
    (column: unknown) =>
      typeof column === "object" &&
      column !== null &&
      FRACTIONAL_TYPE_PATTERN.test(String((column as { type?: unknown }).type)),
  ).length;

  return {
    delimiter: String(row["Delimiter"]),
    fractionalColumnCount,
    readCsvClause: String(row["Prompt"]).replace(/;\s*$/, ""),
  };
}
