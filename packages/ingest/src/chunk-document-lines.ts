import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  DOCUMENT_CHUNKS_TABLE,
  DOCUMENT_LINES_TABLE,
} from "@backed/core";

import { quoteIdentifier, quoteString } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";

export interface DocumentLineRow {
  document_id: string;
  page: number;
  line: number;
  text: string;
}

export interface DocumentChunkRow {
  document_id: string;
  chunk_index: number;
  page_start: number;
  page_end: number;
  text: string;
}

export interface ChunkDocumentLinesOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

async function dropTableIfExists(query: SqlQuery, tableName: string): Promise<void> {
  await query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}

async function listDocumentIds(query: SqlQuery): Promise<string[]> {
  const rows = await query(
    `SELECT DISTINCT document_id FROM ${quoteIdentifier(DOCUMENT_LINES_TABLE)} ORDER BY document_id`,
  );
  return rows.map((row) => String(row["document_id"] ?? ""));
}

async function fetchDocumentLines(
  query: SqlQuery,
  documentId: string,
): Promise<DocumentLineRow[]> {
  const rows = await query(
    `SELECT document_id, page, line, text FROM ${quoteIdentifier(DOCUMENT_LINES_TABLE)} WHERE document_id = ${quoteString(documentId)} ORDER BY page, line`,
  );
  return rows.map((row) => ({
    document_id: String(row["document_id"] ?? ""),
    page: Number(row["page"] ?? 0),
    line: Number(row["line"] ?? 0),
    text: String(row["text"] ?? ""),
  }));
}

function overlapLineCount(lines: DocumentLineRow[], overlapChars: number): number {
  let total = 0;
  let count = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    total += lines[index]!.text.length + 1;
    count += 1;
    if (total >= overlapChars) {
      break;
    }
  }
  return count;
}

export function chunkDocumentLineRows(
  lines: DocumentLineRow[],
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP,
): DocumentChunkRow[] {
  if (lines.length === 0) {
    return [];
  }

  const documentId = lines[0]!.document_id;
  const chunks: DocumentChunkRow[] = [];
  let buffer: DocumentLineRow[] = [];
  let bufferLength = 0;

  const emit = (): void => {
    if (buffer.length === 0) {
      return;
    }
    const text = buffer.map((line) => line.text).join("\n").trim();
    if (text.length === 0) {
      return;
    }
    chunks.push({
      document_id: documentId,
      chunk_index: chunks.length,
      page_start: buffer[0]!.page,
      page_end: buffer[buffer.length - 1]!.page,
      text,
    });
  };

  for (const line of lines) {
    const lineLength = line.text.length + 1;
    if (bufferLength + lineLength > chunkSize && buffer.length > 0) {
      emit();
      const overlapLines = overlapLineCount(buffer, chunkOverlap);
      buffer = buffer.slice(Math.max(0, buffer.length - overlapLines));
      bufferLength = buffer.reduce((total, entry) => total + entry.text.length + 1, 0);
    }
    buffer.push(line);
    bufferLength += lineLength;
  }

  emit();
  return chunks;
}

async function insertChunk(
  query: SqlQuery,
  chunk: DocumentChunkRow,
): Promise<void> {
  await query(
    `INSERT INTO ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} (document_id, chunk_index, page_start, page_end, text) VALUES (${quoteString(chunk.document_id)}, ${String(chunk.chunk_index)}, ${String(chunk.page_start)}, ${String(chunk.page_end)}, ${quoteString(chunk.text)})`,
  );
}

export async function chunkDocumentLines(
  query: SqlQuery,
  options: ChunkDocumentLinesOptions = {},
): Promise<{ dataset: Dataset; chunkCount: number }> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  await dropTableIfExists(query, DOCUMENT_CHUNKS_TABLE);
  await query(
    `CREATE TABLE ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} (
      document_id VARCHAR NOT NULL,
      chunk_index INTEGER NOT NULL,
      page_start INTEGER NOT NULL,
      page_end INTEGER NOT NULL,
      text VARCHAR NOT NULL,
      embedding FLOAT[]
    )`,
  );

  const documentIds = await listDocumentIds(query);
  let chunkCount = 0;

  for (const documentId of documentIds) {
    const lines = await fetchDocumentLines(query, documentId);
    const chunks = chunkDocumentLineRows(lines, chunkSize, chunkOverlap);
    for (const chunk of chunks) {
      await insertChunk(query, chunk);
      chunkCount += 1;
    }
  }

  return {
    dataset: {
      tableName: DOCUMENT_CHUNKS_TABLE,
      sourceFile: "document-chunks",
      format: "json",
    },
    chunkCount,
  };
}
