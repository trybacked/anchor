/** Document chunking and search contract — types and constants only. */

export const DOCUMENT_CHUNKS_TABLE = "document_chunks" as const;

export const DEFAULT_CHUNK_SIZE = 1500;
export const MAX_CHUNK_SIZE = 4000;
export const DEFAULT_CHUNK_OVERLAP = 200;
export const DEFAULT_CHUNK_SEARCH_LIMIT = 10;
export const MAX_CHUNK_SEARCH_LIMIT = 50;

export type ChunkSearchMode = "keyword" | "semantic" | "hybrid";

export interface ChunkSearchRequest {
  query: string;
  mode?: ChunkSearchMode;
  documentId?: string;
  sourceTable?: string;
  limit: number;
}

export type QueryEmbedder = (text: string) => Promise<number[]>;

export type ChunkSearcher = (request: ChunkSearchRequest) => Promise<Record<string, unknown>[]>;
