import type { Entity, Property, SemanticModel } from "../model.js";
import { SemanticModelSchema } from "../model.js";
import type { ValidationIssue } from "./validation-result.js";
import { validationResult } from "./validation-result.js";

function columnNames(entity: Entity): Set<string> {
  return new Set(entity.properties.map((property) => property.columnName));
}

function duplicateIdIssues(kind: string, ids: string[]): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        code: `duplicate_${kind}_id`,
        severity: "error",
        message: `Duplicate ${kind} id "${id}"`,
        path: `${kind}s[id=${id}]`,
      });
    }
    seen.add(id);
  }
  return issues;
}

function validateEntityProperties(entity: Entity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const columns = new Set<string>();
  for (const property of entity.properties) {
    if (columns.has(property.columnName)) {
      issues.push({
        code: "duplicate_property_column",
        severity: "error",
        message: `Entity "${entity.id}" has duplicate columnName "${property.columnName}"`,
        path: `entities[id=${entity.id}].properties[column=${property.columnName}]`,
      });
    }
    columns.add(property.columnName);
  }
  const hasPrimaryKey = entity.properties.some(
    (property: Property) => property.role === "primary_key",
  );
  if (!hasPrimaryKey) {
    issues.push({
      code: "missing_identifier",
      severity: "warning",
      message: `Entity "${entity.id}" has no property with role primary_key`,
      path: `entities[id=${entity.id}]`,
    });
  }
  return issues;
}

export function validateSemanticModel(model: SemanticModel): ReturnType<typeof validationResult> {
  const parseResult = SemanticModelSchema.safeParse(model);
  if (!parseResult.success) {
    return validationResult([
      {
        code: "schema_parse_error",
        severity: "error",
        message: parseResult.error.message,
      },
    ]);
  }

  const parsed = parseResult.data;
  const issues: ValidationIssue[] = [];

  issues.push(
    ...duplicateIdIssues(
      "entity",
      parsed.entities.map((entity) => entity.id),
    ),
  );
  issues.push(
    ...duplicateIdIssues(
      "relation",
      parsed.relations.map((relation) => relation.id),
    ),
  );
  issues.push(
    ...duplicateIdIssues(
      "rule",
      parsed.rules.map((rule) => rule.id),
    ),
  );

  const entities = new Map(parsed.entities.map((entity) => [entity.id, entity]));

  for (const entity of parsed.entities) {
    issues.push(...validateEntityProperties(entity));
  }

  for (const relation of parsed.relations) {
    const path = `relations[id=${relation.id}]`;
    const fromEntity = entities.get(relation.fromEntity);
    const toEntity = entities.get(relation.toEntity);
    if (fromEntity === undefined) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relation "${relation.id}" fromEntity "${relation.fromEntity}" not found`,
        path,
      });
    }
    if (toEntity === undefined) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relation "${relation.id}" toEntity "${relation.toEntity}" not found`,
        path,
      });
    }
    if (fromEntity !== undefined && !columnNames(fromEntity).has(relation.fromColumn)) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relation "${relation.id}" fromColumn "${relation.fromColumn}" not found on entity "${fromEntity.id}"`,
        path,
      });
    }
    if (toEntity !== undefined && !columnNames(toEntity).has(relation.toColumn)) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relation "${relation.id}" toColumn "${relation.toColumn}" not found on entity "${toEntity.id}"`,
        path,
      });
    }
  }

  for (const rule of parsed.rules) {
    const entity = entities.get(rule.appliesTo);
    if (entity === undefined) {
      issues.push({
        code: "invalid_logic_reference",
        severity: "error",
        message: `Rule "${rule.id}" appliesTo "${rule.appliesTo}" not found`,
        path: `rules[id=${rule.id}]`,
      });
      continue;
    }
    if (rule.column !== undefined && !columnNames(entity).has(rule.column)) {
      issues.push({
        code: "invalid_logic_reference",
        severity: "error",
        message: `Rule "${rule.id}" column "${rule.column}" not found on entity "${entity.id}"`,
        path: `rules[id=${rule.id}]`,
      });
    }
  }

  return validationResult(issues);
}
