import type { ChunkSearchMode, ChunkSearchRequest, ChunkSearcher, QueryEmbedder } from "@backed/core";
import { DEFAULT_CHUNK_SEARCH_MIN_SCORE, DEFAULT_EMBEDDING_DIMENSION, DOCUMENT_CHUNKS_TABLE, } from "@backed/core";
import { chunkKey, reciprocalRankFusion } from "./rrf.js";
import { chunkEmbeddingColumnRef, documentChunksHaveEmbeddings, formatEmbeddingLiteral, } from "./chunk-embeddings.js";
import { documentIdsInClause, quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";
export interface ChunkSearcherOptions {
    embedQuery?: QueryEmbedder;
}
const CHUNK_SEARCH_OVERSAMPLE_FACTOR = 3;
const KEYWORD_MIN_TOKEN_LENGTH = 3;
const KEYWORD_STOPWORDS = new Set(["the", "and", "for", "del", "della", "che", "con", "per"]);
const CHUNK_RESULT_COLUMNS = [
    "document_id",
    "chunk_index",
    "page_start",
    "page_end",
    "text",
] as const;
function keywordTokens(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= KEYWORD_MIN_TOKEN_LENGTH && !KEYWORD_STOPWORDS.has(token));
}
function buildScopeConditions(request: ChunkSearchRequest): string[] {
    const conditions: string[] = [];
    if (request.documentId !== undefined) {
        conditions.push(`${quoteIdentifier("document_id")} = ${quoteString(request.documentId)}`);
    }
    if (request.documentIds !== undefined && request.documentIds.length > 0) {
        conditions.push(documentIdsInClause(request.documentIds));
    }
    if (request.sourceTable !== undefined) {
        conditions.push(`${quoteIdentifier("document_id")} IN (SELECT ${quoteIdentifier("document_id")} FROM ${quoteIdentifier(request.sourceTable)})`);
    }
    return conditions;
}
function selectChunkColumns(scoreExpression: string): string {
    const columns = CHUNK_RESULT_COLUMNS.map((column) => quoteIdentifier(column)).join(", ");
    return `${columns}, ${scoreExpression}`;
}
function searchCandidateLimit(limit: number): string {
    return String(limit * CHUNK_SEARCH_OVERSAMPLE_FACTOR);
}
async function keywordSearch(query: SqlQuery, request: ChunkSearchRequest): Promise<Record<string, unknown>[]> {
    const tokens = keywordTokens(request.query);
    const textCondition = tokens.length > 1
        ? `(${tokens.map((token) => `contains(lower(${quoteIdentifier("text")}), ${quoteString(token)})`).join(" OR ")})`
        : `contains(lower(${quoteIdentifier("text")}), lower(${quoteString(request.query)}))`;
    const conditions = [textCondition, ...buildScopeConditions(request)];
    const sql = `SELECT ${selectChunkColumns("CAST(NULL AS DOUBLE) AS score")} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${conditions.join(" AND ")} ORDER BY ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")} LIMIT ${searchCandidateLimit(request.limit)}`;
    return query(sql);
}
async function semanticSearch(query: SqlQuery, request: ChunkSearchRequest, queryEmbedding: number[]): Promise<Record<string, unknown>[]> {
    const minScore = request.minScore ?? DEFAULT_CHUNK_SEARCH_MIN_SCORE;
    const conditions = [
        `${quoteIdentifier("embedding")} IS NOT NULL`,
        ...buildScopeConditions(request),
    ];
    let vectorLiteral: string;
    try {
        vectorLiteral = formatEmbeddingLiteral(queryEmbedding, DEFAULT_EMBEDDING_DIMENSION);
    }
    catch {
        throw new Error(`Query embedding dimension ${String(queryEmbedding.length)} does not match expected ${String(DEFAULT_EMBEDDING_DIMENSION)}. Re-run "backed model" with the configured embedding model.`);
    }
    const scoreExpression = `array_cosine_similarity(${chunkEmbeddingColumnRef()}, ${vectorLiteral}) AS score`;
    const sql = `SELECT ${selectChunkColumns(scoreExpression)} FROM ${quoteIdentifier(DOCUMENT_CHUNKS_TABLE)} WHERE ${conditions.join(" AND ")} ORDER BY score DESC, ${quoteIdentifier("document_id")}, ${quoteIdentifier("chunk_index")} LIMIT ${searchCandidateLimit(request.limit)}`;
    const rows = await query(sql);
    return rows.filter((row) => {
        const score = Number(row["score"] ?? 0);
        return Number.isFinite(score) && score >= minScore;
    }).slice(0, request.limit);
}
function resolveSearchMode(requested: ChunkSearchMode | undefined, embeddingsAvailable: boolean): ChunkSearchMode {
    if (requested !== undefined) {
        return requested;
    }
    return embeddingsAvailable ? "semantic" : "keyword";
}
function mergeHybridResults(semanticRows: Record<string, unknown>[], keywordRows: Record<string, unknown>[], limit: number): Record<string, unknown>[] {
    const fused = reciprocalRankFusion([
        {
            source: "semantic",
            items: semanticRows.map((row) => ({ id: chunkKey(row), payload: row })),
        },
        {
            source: "keyword",
            items: keywordRows.map((row) => ({ id: chunkKey(row), payload: row })),
        },
    ]);
    return fused.slice(0, limit).map((item) => ({
        ...item.payload,
        score: item.score,
        match: "rrf",
    }));
}
export function createChunkSearcher(query: SqlQuery, options: ChunkSearcherOptions = {}): ChunkSearcher {
    return async (request: ChunkSearchRequest) => {
        const embeddingsAvailable = await documentChunksHaveEmbeddings(query);
        const mode = resolveSearchMode(request.mode, embeddingsAvailable);
        if (mode === "keyword") {
            return keywordSearch(query, request);
        }
        if (!options.embedQuery) {
            if (embeddingsAvailable) {
                throw new Error("Semantic chunk search requires an embedding model. Set AI_GATEWAY_API_KEY and run backed model to embed chunks.");
            }
            return keywordSearch(query, request);
        }
        if (!embeddingsAvailable) {
            if (mode === "semantic") {
                throw new Error('No chunk embeddings in the snapshot. Re-run "backed model" on a document corpus to generate them.');
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
