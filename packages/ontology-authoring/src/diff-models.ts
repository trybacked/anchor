import type { Entity, Property, Relation, SemanticModel } from "@trybacked/core";
import type { AuthoringDiffChange } from "./types.js";
function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
function propertyKey(entityId: string, column: string): string {
  return `${entityId}.${column}`;
}
function indexEntities(entities: Entity[]): Map<string, Entity> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}
function indexProperties(entity: Entity): Map<string, Property> {
  return new Map(entity.properties.map((property) => [property.columnName, property]));
}
export function diffSemanticModels(
  before: SemanticModel,
  after: SemanticModel,
): AuthoringDiffChange[] {
  const changes: AuthoringDiffChange[] = [];
  const beforeEntities = indexEntities(before.entities);
  const afterEntities = indexEntities(after.entities);
  for (const [id, entity] of beforeEntities) {
    if (!afterEntities.has(id)) {
      changes.push({
        kind: "breaking",
        subject: id,
        detail: `Entity "${entity.name}" removed`,
      });
    }
  }
  for (const [id, entity] of afterEntities) {
    if (!beforeEntities.has(id)) {
      changes.push({
        kind: "added",
        subject: id,
        detail: `Entity "${entity.name}" added`,
      });
    }
  }
  for (const [id, beforeEntity] of beforeEntities) {
    const afterEntity = afterEntities.get(id);
    if (afterEntity === undefined) {
      continue;
    }
    if (beforeEntity.sourceTable !== afterEntity.sourceTable) {
      changes.push({
        kind: "breaking",
        subject: id,
        detail: `sourceTable changed from ${beforeEntity.sourceTable} to ${afterEntity.sourceTable}`,
      });
    }
    const beforeProps = indexProperties(beforeEntity);
    const afterProps = indexProperties(afterEntity);
    for (const [column, property] of beforeProps) {
      if (!afterProps.has(column)) {
        changes.push({
          kind: property.role === "primary_key" ? "breaking" : "removed",
          subject: propertyKey(id, column),
          detail: `Property "${property.name}" removed from ${id}`,
        });
      }
    }
    for (const [column, property] of afterProps) {
      if (!beforeProps.has(column)) {
        changes.push({
          kind: "added",
          subject: propertyKey(id, column),
          detail: `Property "${property.name}" added to ${id}`,
        });
      }
    }
    for (const [column, beforeProperty] of beforeProps) {
      const afterProperty = afterProps.get(column);
      if (afterProperty === undefined) {
        continue;
      }
      if (beforeProperty.role !== afterProperty.role) {
        changes.push({
          kind:
            beforeProperty.role === "primary_key" || afterProperty.role === "primary_key"
              ? "breaking"
              : "changed",
          subject: propertyKey(id, column),
          detail: `Property role ${beforeProperty.role} → ${afterProperty.role}`,
        });
      }
    }
  }
  const beforeRelations = new Map(before.relations.map((relation) => [relation.id, relation]));
  const afterRelations = new Map(after.relations.map((relation) => [relation.id, relation]));
  for (const [id, relation] of beforeRelations) {
    if (!afterRelations.has(id)) {
      changes.push({
        kind: "removed",
        subject: id,
        detail: `Relation "${relation.name}" removed`,
      });
    }
  }
  for (const [id, relation] of afterRelations) {
    if (!beforeRelations.has(id)) {
      changes.push({
        kind: "added",
        subject: id,
        detail: `Relation "${relation.name}" added`,
      });
    }
  }
  diffRelationColumns(beforeRelations, afterRelations, changes);
  diffModelSemantics(before, after, changes);
  diffEntitySemantics(beforeEntities, afterEntities, changes);
  return changes;
}
function diffModelSemantics(
  before: SemanticModel,
  after: SemanticModel,
  changes: AuthoringDiffChange[],
): void {
  const beforeGlossary = stableJson(before.semantics?.glossary ?? []);
  const afterGlossary = stableJson(after.semantics?.glossary ?? []);
  if (beforeGlossary !== afterGlossary) {
    changes.push({
      kind: "changed",
      subject: "semantics.glossary",
      detail: "Glossary terms updated",
    });
  }
  const beforeExamples = stableJson(before.semantics?.examples ?? []);
  const afterExamples = stableJson(after.semantics?.examples ?? []);
  if (beforeExamples !== afterExamples) {
    changes.push({
      kind: "changed",
      subject: "semantics.examples",
      detail: "Verified examples updated",
    });
  }
}
function diffEntitySemantics(
  beforeEntities: Map<string, Entity>,
  afterEntities: Map<string, Entity>,
  changes: AuthoringDiffChange[],
): void {
  for (const [id, beforeEntity] of beforeEntities) {
    const afterEntity = afterEntities.get(id);
    if (afterEntity === undefined) {
      continue;
    }
    if (stableJson(beforeEntity.semantics) !== stableJson(afterEntity.semantics)) {
      changes.push({
        kind: "changed",
        subject: id,
        detail: `Entity semantics updated for "${beforeEntity.name}"`,
      });
    }
    const beforeProps = indexProperties(beforeEntity);
    const afterProps = indexProperties(afterEntity);
    for (const [column, beforeProperty] of beforeProps) {
      const afterProperty = afterProps.get(column);
      if (afterProperty === undefined) {
        continue;
      }
      if (stableJson(beforeProperty.semantics) !== stableJson(afterProperty.semantics)) {
        changes.push({
          kind: "changed",
          subject: propertyKey(id, column),
          detail: `Property semantics updated for "${beforeProperty.name}"`,
        });
      }
    }
  }
}
function diffRelationColumns(
  beforeRelations: Map<string, Relation>,
  afterRelations: Map<string, Relation>,
  changes: AuthoringDiffChange[],
): void {
  for (const [id, beforeRelation] of beforeRelations) {
    const afterRelation = afterRelations.get(id);
    if (afterRelation === undefined) {
      continue;
    }
    if (
      beforeRelation.fromColumn !== afterRelation.fromColumn ||
      beforeRelation.toColumn !== afterRelation.toColumn
    ) {
      changes.push({
        kind: "breaking",
        subject: id,
        detail: "Relation join columns changed",
      });
    }
  }
}
