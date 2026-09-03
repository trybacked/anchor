/**
 * Pure query functions over a SemanticModel — the testable core of the MCP
 * server. Tool handlers in server.ts are thin wrappers around these.
 */

import type { Entity, Relation, Rule, SemanticModel } from "@backed/core";

export interface EntitySummary {
  id: string;
  name: string;
  description?: string;
  sourceTable: string;
  status: Entity["status"];
  confidence: number;
}

export interface EntityDetail {
  entity: Entity;
  relations: Relation[];
  rules: Rule[];
}

export interface SearchMatch {
  kind: "entity" | "property" | "relation" | "rule";
  id: string;
  name: string;
  snippet: string;
}

export function listEntities(model: SemanticModel): EntitySummary[] {
  return model.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    ...(entity.description !== undefined ? { description: entity.description } : {}),
    sourceTable: entity.sourceTable,
    status: entity.status,
    confidence: entity.confidence,
  }));
}

export function getEntity(model: SemanticModel, id: string): EntityDetail | null {
  const entity = model.entities.find((candidate) => candidate.id === id);
  if (!entity) {
    return null;
  }
  return {
    entity,
    relations: model.relations.filter(
      (relation) => relation.fromEntity === id || relation.toEntity === id,
    ),
    rules: model.rules.filter((rule) => rule.appliesTo === id),
  };
}

export function listRelations(model: SemanticModel): Relation[] {
  return model.relations;
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export function searchModel(model: SemanticModel, rawQuery: string): SearchMatch[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) {
    return [];
  }

  const results: SearchMatch[] = [];

  for (const entity of model.entities) {
    if (matches(query, entity.id, entity.name, entity.description, entity.sourceTable)) {
      results.push({
        kind: "entity",
        id: entity.id,
        name: entity.name,
        snippet: entity.description ?? `Entity from table "${entity.sourceTable}"`,
      });
    }
    for (const property of entity.properties) {
      if (matches(query, property.name, property.columnName)) {
        results.push({
          kind: "property",
          id: `${entity.id}.${property.columnName}`,
          name: property.name,
          snippet: `Attribute of "${entity.name}" (column ${property.columnName}, type ${property.semanticType})`,
        });
      }
    }
  }

  for (const relation of model.relations) {
    if (matches(query, relation.id, relation.name, relation.fromEntity, relation.toEntity)) {
      results.push({
        kind: "relation",
        id: relation.id,
        name: relation.name,
        snippet: `${relation.fromEntity}.${relation.fromColumn} → ${relation.toEntity}.${relation.toColumn} (${relation.cardinality})`,
      });
    }
  }

  for (const rule of model.rules) {
    if (matches(query, rule.id, rule.name, rule.definition)) {
      results.push({
        kind: "rule",
        id: rule.id,
        name: rule.name,
        snippet: rule.definition,
      });
    }
  }

  return results;
}
