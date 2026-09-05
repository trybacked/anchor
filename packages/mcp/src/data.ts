import type { EntityRowRequest, RowFilter, RowReader, SemanticModel } from "@backed/core";
import { DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT } from "@backed/core";

export type QueryEntityError =
  | { kind: "unknown_entity"; entityId: string }
  | { kind: "unknown_column"; entityId: string; column: string };

export type QueryEntityResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: QueryEntityError };

export interface QueryEntityInput {
  id: string;
  filters?: RowFilter[] | undefined;
  orderBy?: string | undefined;
  limit?: number | undefined;
}

function formatQueryEntityError(error: QueryEntityError): string {
  switch (error.kind) {
    case "unknown_entity":
      return `Entity "${error.entityId}" not found. Use list_entities for available ids.`;
    case "unknown_column":
      return `Column "${error.column}" is not a property of entity "${error.entityId}". Use get_entity for valid column names.`;
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

  const request: EntityRowRequest = {
    table: entity.sourceTable,
    filters: input.filters ?? [],
    ...(input.orderBy !== undefined ? { orderBy: input.orderBy } : {}),
    limit,
  };

  const rows = await reader(request);
  return { ok: true, rows };
}
