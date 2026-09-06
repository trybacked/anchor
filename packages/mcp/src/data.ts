import type {
  ChunkSearchMode,
  ChunkSearcher,
  EntityRowRequest,
  RowFilter,
  RowReader,
  SemanticModel,
} from "@backed/core";
import { DEFAULT_ROW_LIMIT, DOCUMENT_CHUNKS_TABLE, MAX_ROW_LIMIT } from "@backed/core";

export type QueryEntityError =
  | { kind: "unknown_entity"; entityId: string }
  | { kind: "unknown_column"; entityId: string; column: string }
  | { kind: "missing_text_search"; entityId: string; message: string };

export type QueryEntityResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: QueryEntityError };

export interface QueryEntityInput {
  id: string;
  filters?: RowFilter[] | undefined;
  orderBy?: string | undefined;
  limit?: number | undefined;
  /** Free-text search: chunk semantic/keyword search on document_chunk, substring search on text columns elsewhere. */
  text?: string | undefined;
  textMode?: ChunkSearchMode | undefined;
  /** Scope chunk or row search to one ingested document id when known. */
  documentId?: string | undefined;
}

export interface QueryEntityDependencies {
  chunkSearcher?: ChunkSearcher | undefined;
}

const DOCUMENT_CHUNK_ENTITY_ID = "document_chunk";

function formatQueryEntityError(error: QueryEntityError): string {
  switch (error.kind) {
    case "unknown_entity":
      return `Entity "${error.entityId}" not found. Use list_entities for available ids.`;
    case "unknown_column":
      return `Column "${error.column}" is not a property of entity "${error.entityId}". Use get_entity for valid column names.`;
    case "missing_text_search":
      return error.message;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function queryEntityErrorMessage(error: QueryEntityError): string {
  return formatQueryEntityError(error);
}

export async function queryEntityRows(
  model: SemanticModel,
  reader: RowReader,
  input: QueryEntityInput,
  dependencies: QueryEntityDependencies = {},
): Promise<QueryEntityResult> {
  const entity = model.entities.find((candidate) => candidate.id === input.id);
  if (!entity) {
    return { ok: false, error: { kind: "unknown_entity", entityId: input.id } };
  }

  const allowedColumns = new Set(entity.properties.map((property) => property.columnName));

  for (const filter of input.filters ?? []) {
    if (!allowedColumns.has(filter.column)) {
      return {
        ok: false,
        error: { kind: "unknown_column", entityId: input.id, column: filter.column },
      };
    }
  }

  if (input.orderBy !== undefined && !allowedColumns.has(input.orderBy)) {
    return {
      ok: false,
      error: { kind: "unknown_column", entityId: input.id, column: input.orderBy },
    };
  }

  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_ROW_LIMIT), MAX_ROW_LIMIT);
  const text = input.text?.trim();

  if (text !== undefined && text.length > 0) {
    const isChunkEntity =
      entity.id === DOCUMENT_CHUNK_ENTITY_ID || entity.sourceTable === DOCUMENT_CHUNKS_TABLE;
    const isDocumentType = entity.sourceTable.startsWith("doc_");

    if (isChunkEntity || isDocumentType) {
      if (!dependencies.chunkSearcher) {
        return {
          ok: false,
          error: {
            kind: "missing_text_search",
            entityId: input.id,
            message:
              'Text search on documents requires a data snapshot. Re-run "backed model" on your sources.',
          },
        };
      }

      const rows = await dependencies.chunkSearcher({
        query: text,
        limit,
        ...(input.textMode !== undefined ? { mode: input.textMode } : {}),
        ...(input.documentId !== undefined ? { documentId: input.documentId } : {}),
        ...(isDocumentType ? { sourceTable: entity.sourceTable } : {}),
      });
      return { ok: true, rows };
    }

    const textSearchColumns = entity.properties
      .filter(
        (property) =>
          property.semanticType === "text" ||
          property.semanticType === "identifier" ||
          property.columnName === "subject",
      )
      .map((property) => property.columnName);

    if (textSearchColumns.length === 0) {
      return {
        ok: false,
        error: {
          kind: "missing_text_search",
          entityId: input.id,
          message: `Entity "${entity.name}" has no searchable text columns. Try entity "document_chunk" for full document body search.`,
        },
      };
    }

    const request: EntityRowRequest = {
      table: entity.sourceTable,
      filters: input.filters ?? [],
      textSearch: text,
      textSearchColumns,
      ...(input.orderBy !== undefined ? { orderBy: input.orderBy } : {}),
      limit,
    };
    const rows = await reader(request);
    return { ok: true, rows };
  }

  const request: EntityRowRequest = {
    table: entity.sourceTable,
    filters: input.filters ?? [],
    ...(input.orderBy !== undefined ? { orderBy: input.orderBy } : {}),
    limit,
  };

  const rows = await reader(request);
  return { ok: true, rows };
}
