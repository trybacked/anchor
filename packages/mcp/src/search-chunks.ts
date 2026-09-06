import type { ChunkSearchMode, ChunkSearchRequest, ChunkSearcher, SemanticModel } from "@backed/core";
import {
  DEFAULT_CHUNK_SEARCH_LIMIT,
  MAX_CHUNK_SEARCH_LIMIT,
} from "@backed/core";

export type SearchDocumentChunksError =
  | { kind: "unknown_entity"; entityId: string }
  | { kind: "empty_query" };

export type SearchDocumentChunksResult =
  | { ok: true; chunks: Record<string, unknown>[] }
  | { ok: false; error: SearchDocumentChunksError };

export interface SearchDocumentChunksInput {
  query: string;
  mode?: ChunkSearchMode | undefined;
  entityId?: string | undefined;
  documentId?: string | undefined;
  limit?: number | undefined;
}

function formatSearchError(error: SearchDocumentChunksError): string {
  switch (error.kind) {
    case "unknown_entity":
      return `Entity "${error.entityId}" not found. Use list_entities for document type ids (e.g. determination, notice).`;
    case "empty_query":
      return "Search query must not be empty.";
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function searchDocumentChunksErrorMessage(error: SearchDocumentChunksError): string {
  return formatSearchError(error);
}

export async function searchDocumentChunks(
  model: SemanticModel,
  searcher: ChunkSearcher,
  input: SearchDocumentChunksInput,
): Promise<SearchDocumentChunksResult> {
  const query = input.query.trim();
  if (query.length === 0) {
    return { ok: false, error: { kind: "empty_query" } };
  }

  let sourceTable: string | undefined;
  if (input.entityId !== undefined) {
    const entity = model.entities.find((candidate) => candidate.id === input.entityId);
    if (!entity) {
      return { ok: false, error: { kind: "unknown_entity", entityId: input.entityId } };
    }
    sourceTable = entity.sourceTable;
  }

  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_CHUNK_SEARCH_LIMIT),
    MAX_CHUNK_SEARCH_LIMIT,
  );

  const request: ChunkSearchRequest = {
    query,
    limit,
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.documentId !== undefined ? { documentId: input.documentId } : {}),
    ...(sourceTable !== undefined ? { sourceTable } : {}),
  };

  const chunks = await searcher(request);
  return { ok: true, chunks };
}
