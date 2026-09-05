import type { ChunkSearchMode, ChunkSearchRequest, ChunkSearcher, QueryEmbedder } from "@backed/core";
import { DOCUMENT_CHUNKS_TABLE } from "@backed/core";

import { documentChunksHaveEmbeddings } from "./chunk-embeddings.js";
import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";

export interface ChunkSearcherOptions {
  embedQuery?: QueryEmbedder;
}

function chunkKey(row: Record<string, unknown>): string {
  return `${String(row["document_id"] ?? "")}:${String(row["chunk_index"] ?? "")}`;
}

function buildScopeConditions(request: ChunkSearchRequest): string[] {
  const conditions: string[] = [];

  if (request.documentId !== undefined) {
    conditions.push(
      `${quoteIdentifier("document_id")} = ${quoteString(request.documentId)}`,
    );
  }

  if (request.sourceTable !== undefined) {
    conditions.push(
      `${quoteIdentifier("document_id")} IN (SELECT ${quoteIdentifier("document_id")} FROM ${quoteIdentifier(request.sourceTable)})`,
    );
  }

  return conditions;
}

function formatEmbeddingLiteral(values: number[]): string {
  return `[${values.map((value) => String(value)).join(", ")}]::FLOAT[${String(values.length)}]`;
}

async function keywordSearch(
  query: SqlQuery,
  request: ChunkSearchRequest,
): Promise<Record<string, unknown>[]> {
  const conditions = [
    `contains(lower(${quoteIdentifier("text")}), lower(${quoteString(request.query)}))`,
    ...buildScopeConditions(request),
  ];

  const sql = `SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}, ${quoteIdentifier("page_start")}, ${quoteIdentifier("page_end")}, ${quoteIdentifier("text")}, CAST(NULL AS DOUBLE) AS score FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${conditions.join(" AND ")} ORDER BY ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")} LIMIT ${String(request.limit)}`;
  return query(sql);
}

async function semanticSearch(
  query: SqlQuery,
  request: ChunkSearchRequest,
  queryEmbedding: number[],
): Promise<Record<string, unknown>[]> {
  const conditions = [
    `${quoteIdentifier("embedding")} IS NOT NULL`,
    ...buildScopeConditions(request),
  ];

  const vectorLiteral = formatEmbeddingLiteral(queryEmbedding);
  const sql = `SELECT ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")}, ${quoteIdentifier("page_start")}, ${quoteIdentifier("page_end")}, ${quoteIdentifier("text")}, array_cosine_similarity(${quoteIdentifier("embedding")}, ${vectorLiteral}) AS score FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${conditions.join(" AND ")} ORDER BY score DESC, ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")} LIMIT ${String(request.limit)}`;
  return query(sql);
}

function resolveSearchMode(
  requested: ChunkSearchMode | undefined,
  embeddingsAvailable: boolean,
): ChunkSearchMode {
  if (requested !== undefined) {
    return requested;
  }
  return embeddingsAvailable ? "hybrid" : "keyword";
}

function mergeHybridResults(
  semanticRows: Record<string, unknown>[],
  keywordRows: Record<string, unknown>[],
  limit: number,
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();

  for (const row of semanticRows) {
    merged.set(chunkKey(row), { ...row, match: "semantic" });
  }

  for (const row of keywordRows) {
    const key = chunkKey(row);
    if (!merged.has(key)) {
      merged.set(key, { ...row, score: 1, match: "keyword" });
    }
  }

  return [...merged.values()].slice(0, limit);
}

export function createChunkSearcher(
  query: SqlQuery,
  options: ChunkSearcherOptions = {},
): ChunkSearcher {
  return async (request: ChunkSearchRequest) => {
    const embeddingsAvailable = await documentChunksHaveEmbeddings(query);
    const mode = resolveSearchMode(request.mode, embeddingsAvailable);

    if (mode === "keyword") {
      return keywordSearch(query, request);
    }

    if (!options.embedQuery) {
      if (embeddingsAvailable) {
        throw new Error(
          "Semantic chunk search requires an embedding model. Set AI_GATEWAY_API_KEY and run backed model to embed chunks.",
        );
      }
      return keywordSearch(query, request);
    }

    if (!embeddingsAvailable) {
      if (mode === "semantic") {
        throw new Error(
          'No chunk embeddings in the snapshot. Re-run "backed model" on a document corpus to generate them.',
        );
      }
      return keywordSearch(query, request);
    }

    const queryEmbedding = await options.embedQuery(request.query);

    if (mode === "semantic") {
      return semanticSearch(query, request, queryEmbedding);
    }

    const [semanticRows, keywordRows] = await Promise.all([
      semanticSearch(query, request, queryEmbedding),
      keywordSearch(query, request),
    ]);
    return mergeHybridResults(semanticRows, keywordRows, request.limit);
  };
}
