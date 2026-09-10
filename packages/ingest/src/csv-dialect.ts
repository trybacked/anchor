import { NATIVE_FRACTIONAL_TYPE_PATTERN } from "@backed/core";
import { open } from "node:fs/promises";
import {
    ENCODING_PROBE_MAX_BYTES,
    UTF8_TAIL_TRIM_BYTES,
} from "./constants.js";
import { readRowString } from "./duckdb-row.js";
import { quoteString } from "./sql.js";
import type { CsvDialect, CsvEncoding, SqlQuery } from "./types.js";
export interface SniffedCsv {
    dialect: CsvDialect;
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
        const probe = size > probeSize
            ? buffer.subarray(0, probeSize - UTF8_TAIL_TRIM_BYTES)
            : buffer;
        try {
            new TextDecoder("utf-8", { fatal: true }).decode(probe);
            return "utf-8";
        }
        catch {
            return "latin-1";
        }
    }
    finally {
        await handle.close();
    }
}
export async function sniffCsvDialect(query: SqlQuery, filePath: string, encoding: CsvEncoding): Promise<SniffedCsv> {
    const defaultSniff = await sniffCsv(query, filePath, encoding, ".");
    const commaSniff = await sniffCsv(query, filePath, encoding, ",");
    if (defaultSniff === undefined && commaSniff === undefined) {
        throw new Error("sniff_csv did not produce a valid dialect");
    }
    const useDecimalComma = commaSniff !== undefined &&
        (defaultSniff === undefined ||
            commaSniff.fractionalColumnCount > defaultSniff.fractionalColumnCount);
    const chosen = useDecimalComma ? commaSniff : defaultSniff;
    if (chosen === undefined) {
        throw new Error("sniff_csv did not produce a valid dialect");
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
async function sniffCsv(query: SqlQuery, filePath: string, encoding: CsvEncoding, decimalSeparator: string): Promise<SniffRow | undefined> {
    const options = [
        quoteString(filePath),
        `encoding=${quoteString(encoding)}`,
        `decimal_separator=${quoteString(decimalSeparator)}`,
    ].join(", ");
    let rows: Record<string, unknown>[];
    try {
        rows = await query(`FROM sniff_csv(${options})`);
    }
    catch {
        return undefined;
    }
    const row = rows[0];
    if (row === undefined) {
        return undefined;
    }
    const columns = Array.isArray(row["Columns"]) ? row["Columns"] : [];
    const fractionalColumnCount = columns.filter((column: unknown) => typeof column === "object" &&
        column !== null &&
        NATIVE_FRACTIONAL_TYPE_PATTERN.test(String((column as {
            type?: unknown;
        }).type))).length;
    return {
        delimiter: readRowString(row, "Delimiter"),
        fractionalColumnCount,
        readCsvClause: readRowString(row, "Prompt").replace(/;\s*$/, ""),
    };
}
