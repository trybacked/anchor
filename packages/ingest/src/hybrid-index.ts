import {
  bindNamedParameters,
  createDuckDbSqlExecutor,
  duckDbExec,
} from "@trybacked/infrastructure";
import type { DocumentChunk } from "./chunk.js";
import type { IngestFileRecord } from "./types.js";

export type HybridSearchHit = {
  chunkId: string;
  documentUri: string;
  text: string;
  score: number;
  collection?: string;
  mimeType?: string;
};

/** BEIR (2104.08663): lexical retrieval + metadata filters (Multi-Meta-RAG 2406.13213). */
function lexicalScore(text: string, query: string): number {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (tokens.length === 0) {
    return 0;
  }
  const lower = text.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (lower.includes(token)) {
      hits += 1;
    }
  }
  return hits / tokens.length;
}

export async function ensureChunkIndex(duckDbPath: string): Promise<void> {
  await duckDbExec(duckDbPath, "CREATE SCHEMA IF NOT EXISTS docs;");
  await duckDbExec(
    duckDbPath,
    `CREATE TABLE IF NOT EXISTS docs.document_chunks (
      chunk_id VARCHAR PRIMARY KEY,
      document_uri VARCHAR NOT NULL,
      collection VARCHAR,
      mime_type VARCHAR,
      text VARCHAR NOT NULL,
      char_start INTEGER,
      char_end INTEGER
    );`,
  );
}

export async function upsertDocumentChunks(
  duckDbPath: string,
  record: IngestFileRecord,
  documentUri: string,
  chunks: DocumentChunk[],
): Promise<void> {
  await ensureChunkIndex(duckDbPath);
  const executor = createDuckDbSqlExecutor(duckDbPath);
  for (const chunk of chunks) {
    const chunkId = `${record.sha256}_${String(chunk.index)}`;
    await duckDbExec(
      duckDbPath,
      bindNamedParameters(`DELETE FROM docs.document_chunks WHERE chunk_id = :chunkId`, { chunkId }),
    );
    await duckDbExec(
      duckDbPath,
      bindNamedParameters(
        `INSERT INTO docs.document_chunks (chunk_id, document_uri, collection, mime_type, text, char_start, char_end)
         VALUES (:chunkId, :documentUri, :collection, :mimeType, :text, :charStart, :charEnd)`,
        {
          chunkId,
          documentUri,
          collection: record.collection,
          mimeType: record.mimeType,
          text: chunk.text,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        },
      ),
    );
    void executor;
  }
}

export async function hybridSearchChunks(
  duckDbPath: string,
  query: string,
  options: { limit?: number; collection?: string; mimeType?: string } = {},
): Promise<HybridSearchHit[]> {
  await ensureChunkIndex(duckDbPath);
  const limit = options.limit ?? 12;
  const executor = createDuckDbSqlExecutor(duckDbPath);
  const filters: string[] = [];
  const params: Record<string, string | null> = {};
  if (options.collection !== undefined) {
    filters.push("collection = :collection");
    params.collection = options.collection;
  }
  if (options.mimeType !== undefined) {
    filters.push("mime_type = :mimeType");
    params.mimeType = options.mimeType;
  }
  const where = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";
  const sql = bindNamedParameters(
    `SELECT chunk_id, document_uri, collection, mime_type, text FROM docs.document_chunks${where} LIMIT :rowLimit`,
    { ...params, rowLimit: Math.min(limit * 20, 500) },
  );
  const rows = await executor.execute(sql);
  return rows
    .map((row) => {
      const text = String(row.text ?? "");
      const collection = row.collection === null || row.collection === undefined ? undefined : String(row.collection);
      const mimeType = row.mime_type === null || row.mime_type === undefined ? undefined : String(row.mime_type);
      return {
        chunkId: String(row.chunk_id),
        documentUri: String(row.document_uri),
        text,
        score: lexicalScore(text, query),
        ...(collection !== undefined ? { collection } : {}),
        ...(mimeType !== undefined ? { mimeType } : {}),
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
