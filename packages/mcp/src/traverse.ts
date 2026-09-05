import type { RowReader, SemanticModel } from "@backed/core";
import { DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT } from "@backed/core";

export type TraverseRelationError =
  | { kind: "unknown_relation"; relationId: string }
  | { kind: "unknown_entity"; entityId: string };

export type TraverseRelationResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: TraverseRelationError };

export interface TraverseRelationInput {
  relationId: string;
  value: string | number;
  direction?: "forward" | "reverse" | undefined;
  limit?: number | undefined;
}

function formatTraverseRelationError(error: TraverseRelationError): string {
  switch (error.kind) {
    case "unknown_relation":
      return `Relation "${error.relationId}" not found. Use list_relations or get_entity for available relation ids.`;
    case "unknown_entity":
      return `Entity "${error.entityId}" referenced by the relation is not in the model.`;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function traverseRelationErrorMessage(error: TraverseRelationError): string {
  return formatTraverseRelationError(error);
}

export async function traverseRelationRows(
  model: SemanticModel,
  reader: RowReader,
  input: TraverseRelationInput,
): Promise<TraverseRelationResult> {
  const relation = model.relations.find((candidate) => candidate.id === input.relationId);
  if (!relation) {
    return { ok: false, error: { kind: "unknown_relation", relationId: input.relationId } };
  }

  const direction = input.direction ?? "forward";
  let targetEntityId: string;
  let filterColumn: string;

  switch (direction) {
    case "forward":
      targetEntityId = relation.toEntity;
      filterColumn = relation.toColumn;
      break;
    case "reverse":
      targetEntityId = relation.fromEntity;
      filterColumn = relation.fromColumn;
      break;
    default: {
      const _exhaustive: never = direction;
      return _exhaustive;
    }
  }

  const entity = model.entities.find((candidate) => candidate.id === targetEntityId);
  if (!entity) {
    return { ok: false, error: { kind: "unknown_entity", entityId: targetEntityId } };
  }

  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_ROW_LIMIT), MAX_ROW_LIMIT);
  const rows = await reader({
    table: entity.sourceTable,
    filters: [{ column: filterColumn, op: "=", value: input.value }],
    limit,
  });

  return { ok: true, rows };
}
