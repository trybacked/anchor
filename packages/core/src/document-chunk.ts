import { DEFAULT_SEARCH_MIN_SCORE } from "./constants.js";
export { DOCUMENT_CHUNKS_TABLE } from "./tables.js";
export const DEFAULT_CHUNK_SIZE = 1500;
export const MAX_CHUNK_SIZE = 4000;
export const DEFAULT_CHUNK_OVERLAP = 200;
export const DEFAULT_CHUNK_SEARCH_LIMIT = 10;
export const MAX_CHUNK_SEARCH_LIMIT = 50;
export const DEFAULT_CHUNK_SEARCH_MIN_SCORE = DEFAULT_SEARCH_MIN_SCORE;
export const DEFAULT_EMBEDDING_DIMENSION = 1536;
export type ChunkSearchMode = "keyword" | "semantic" | "hybrid";
export interface ChunkSearchRequest {
    query: string;
    mode?: ChunkSearchMode;
    documentId?: string;
    documentIds?: string[];
    sourceTable?: string;
    limit: number;
    minScore?: number;
}
export type QueryEmbedder = (text: string) => Promise<number[]>;
export type ChunkSearcher = (request: ChunkSearchRequest) => Promise<Record<string, unknown>[]>;
