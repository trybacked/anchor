import type { AuthoringCommand, Entity, Property, Relation, SemanticModel } from "@trybacked/core";

function tableShortName(tableId: string): string {
  const parts = tableId.split(".").filter((part) => part.length > 0);
  return (parts[parts.length - 1] ?? tableId).toLowerCase();
}

function sourceTablesEquivalent(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || tableShortName(left) === tableShortName(right);
}

function findDraftEntityBySource(draft: SemanticModel, sourceTable: string): Entity | undefined {
  return draft.entities.find((entity) => sourceTablesEquivalent(entity.sourceTable, sourceTable));
}

function propertyCommands(
  draftEntityId: string,
  existing: readonly Property[],
  incoming: readonly Property[],
): AuthoringCommand[] {
  const commands: AuthoringCommand[] = [];
  const existingColumns = new Set(existing.map((property) => property.columnName));
  for (const property of incoming) {
    if (existingColumns.has(property.columnName)) {
      continue;
    }
    commands.push({
      type: "addProperty",
      entityId: draftEntityId,
      property,
    });
  }
  return commands;
}

export type CommandsFromReviewedDiscoveryOptions = {
  includeRelations?: boolean;
};

/** Turns a post-review discovery model into non-destructive draft commands. */
export function commandsFromReviewedDiscovery(
  draft: SemanticModel,
  reviewed: SemanticModel,
  options: CommandsFromReviewedDiscoveryOptions = {},
): AuthoringCommand[] {
  const includeRelations = options.includeRelations ?? true;
  const commands: AuthoringCommand[] = [];
  const entityIdByReviewedId = new Map<string, string>();

  for (const entity of reviewed.entities) {
    const existing = draft.entities.find((entry) => entry.id === entity.id);
    const bySource = findDraftEntityBySource(draft, entity.sourceTable);
    const target = existing ?? bySource;
    const confirmed = {
      ...entity,
      status: entity.status === "proposed" ? ("confirmed" as const) : entity.status,
    };
    if (target === undefined) {
      commands.push({ type: "addEntity", entity: confirmed });
      entityIdByReviewedId.set(entity.id, entity.id);
      continue;
    }
    entityIdByReviewedId.set(entity.id, target.id);
    commands.push(...propertyCommands(target.id, target.properties, entity.properties));
  }

  if (!includeRelations) {
    return commands;
  }

  const knownEntityIds = new Set(draft.entities.map((entity) => entity.id));
  for (const [, mappedId] of entityIdByReviewedId) {
    knownEntityIds.add(mappedId);
  }
  for (const entity of reviewed.entities) {
    if (!knownEntityIds.has(entity.id)) {
      knownEntityIds.add(entity.id);
    }
  }

  const existingRelationIds = new Set(draft.relations.map((relation) => relation.id));
  for (const relation of reviewed.relations) {
    if (existingRelationIds.has(relation.id)) {
      continue;
    }
    const fromEntity = entityIdByReviewedId.get(relation.fromEntity) ?? relation.fromEntity;
    const toEntity = entityIdByReviewedId.get(relation.toEntity) ?? relation.toEntity;
    if (!knownEntityIds.has(fromEntity) || !knownEntityIds.has(toEntity)) {
      continue;
    }
    const remapped: Relation = {
      ...relation,
      fromEntity,
      toEntity,
      status: relation.status === "proposed" ? ("confirmed" as const) : relation.status,
    };
    commands.push({ type: "addRelation", relation: remapped });
  }

  return commands;
}
