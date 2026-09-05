import { DOCUMENT_CHUNKS_TABLE } from "@backed/core";

import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";

export interface StoredChunkEmbedding {
  document_id: string;
  chunk_index: number;
  embedding: number[];
}

export interface ChunkTextRow {
  document_id: string;
  chunk_index: number;
  text: string;
}

function formatEmbeddingLiteral(values: number[]): string {
  return `[${values.map((value) => String(value)).join(", ")}]`;
}

export async function ensureChunkEmbeddingColumn(query: SqlQuery): Promise<void> {
  const columns = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = ${quoteString(DOCUMENT_CHUNKS_TABLE)} AND column_name = 'embedding'`,
  );
  if (columns.length === 0) {
    await query(
      `ALTER TABLE ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} ADD COLUMN embedding FLOAT[]`,
    );
  }
}

export async function fetchChunkTextsForEmbedding(query: SqlQuery): Promise<ChunkTextRow[]> {
  const rows = await query(
    `SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}, ${quoteIdentifier("text")} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} ORDER BY ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}`,
  );
  return rows.map((row) => ({
    document_id: String(row["document_id"] ?? ""),
    chunk_index: Number(row["chunk_index"] ?? 0),
    text: String(row["text"] ?? ""),
  }));
}

export async function storeChunkEmbeddings(
  query: SqlQuery,
  items: StoredChunkEmbedding[],
): Promise<void> {
  await ensureChunkEmbeddingColumn(query);
  for (const item of items) {
    await query(
      `UPDATE ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} SET ${quoteIdentifier("embedding")} = ${formatEmbeddingLiteral(item.embedding)}::FLOAT[] WHERE ${quoteIdentifier("document_id")} = ${quoteString(item.document_id)} AND ${quoteIdentifier("chunk_index")} = ${String(item.chunk_index)}`,
    );
  }
}

export async function documentChunksHaveEmbeddings(query: SqlQuery): Promise<boolean> {
  try {
    const rows = await query(
      `SELECT 1 FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${quoteIdentifier("embedding")} IS NOT NULL LIMIT 1`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
