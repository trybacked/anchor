import type { DocumentParser, ParsedDocument } from "@trybacked/ports";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import Papa from "papaparse";
import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { execFileSync } from "node:child_process";
import { mimeFromPath } from "../mime.js";

function blocksFromPlainText(uri: string, mimeType: string, plainText: string): ParsedDocument {
  const lines = plainText.split(/\r?\n/);
  let offset = 0;
  const blocks = lines.map((line) => {
    const text = line.trimEnd();
    const charStart = offset;
    offset += line.length + 1;
    return {
      kind: "paragraph" as const,
      text,
      charStart,
      charEnd: charStart + text.length,
    };
  });
  return { uri, mimeType, blocks, tables: [], plainText };
}

async function parsePdf(uri: string, bytes: Buffer): Promise<ParsedDocument> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return blocksFromPlainText(uri, "application/pdf", text);
  } catch {
    const tmp = execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes, encoding: "utf8" });
    return blocksFromPlainText(uri, "application/pdf", tmp);
  }
}

async function parseDocx(uri: string, bytes: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return blocksFromPlainText(uri, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", result.value);
}

function parseCsv(uri: string, bytes: Buffer): ParsedDocument {
  const text = bytes.toString("utf8");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data.filter((row) => row.some((cell) => cell.trim().length > 0));
  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  const plainText = rows.map((row) => row.join("\t")).join("\n");
  return {
    uri,
    mimeType: "text/csv",
    blocks: [{ kind: "paragraph", text: plainText, charStart: 0, charEnd: plainText.length }],
    tables: [{ headers, rows: body }],
    plainText,
  };
}

function parseXlsx(uri: string, bytes: Buffer): ParsedDocument {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  const rows = sheet ? (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][]) : [];
  const headers = rows[0]?.map(String) ?? [];
  const body = rows.slice(1).map((row) => row.map(String));
  const plainText = rows.map((row) => row.join("\t")).join("\n");
  return {
    uri,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    blocks: [{ kind: "paragraph", text: plainText, charStart: 0, charEnd: plainText.length }],
    tables: [{ headers, rows: body }],
    plainText,
  };
}

function parseHtml(uri: string, bytes: Buffer): ParsedDocument {
  const html = bytes.toString("utf8");
  const $ = cheerio.load(html);
  $("script,style").remove();
  const plainText = $("body").text().replace(/\s+/g, " ").trim();
  return blocksFromPlainText(uri, "text/html", plainText);
}

function parseJson(uri: string, bytes: Buffer): ParsedDocument {
  const plainText = bytes.toString("utf8");
  return blocksFromPlainText(uri, "application/json", plainText);
}

export function createNodeDocumentParser(): DocumentParser {
  return {
    supportedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/html",
      "text/markdown",
      "text/plain",
      "application/json",
    ],
    async parse(input) {
      const mimeType =
        input.mimeType !== "application/octet-stream" ? input.mimeType : mimeFromPath(input.uri);
      switch (mimeType) {
        case "application/pdf":
          return parsePdf(input.uri, input.bytes);
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        case "application/msword":
          return parseDocx(input.uri, input.bytes);
        case "text/csv":
          return parseCsv(input.uri, input.bytes);
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
          return parseXlsx(input.uri, input.bytes);
        case "text/html":
          return parseHtml(input.uri, input.bytes);
        case "application/json":
          return parseJson(input.uri, input.bytes);
        default:
          return blocksFromPlainText(input.uri, mimeType, input.bytes.toString("utf8"));
      }
    },
  };
}
