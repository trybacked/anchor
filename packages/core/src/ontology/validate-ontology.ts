import type { Ontology, OntologyObject, OntologyProperty } from "./spec.js";
import { OntologyPropertyTypeSchema, OntologySchema } from "./spec.js";
import type { ValidationIssue } from "./validation-result.js";
import { validationResult } from "./validation-result.js";

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function duplicateIdIssues(kind: string, ids: string[], pathPrefix: string): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        code: `duplicate_${kind}_id`,
        severity: "error",
        message: `Duplicate ${kind} id "${id}"`,
        path: `${pathPrefix}[id=${id}]`,
      });
    }
    seen.add(id);
  }
  return issues;
}

function propertyMap(object: OntologyObject): Map<string, OntologyProperty> {
  return new Map(object.properties.map((property) => [property.id, property]));
}

function validatePropertyTypes(object: OntologyObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const property of object.properties) {
    const basePath = `objects[id=${object.id}].properties[id=${property.id}]`;
    if (
      property.type === "enum" &&
      (property.enumValues === undefined || property.enumValues.length === 0)
    ) {
      issues.push({
        code: "invalid_property_type",
        severity: "error",
        message: `Property "${property.id}" uses type "enum" but enumValues is missing or empty`,
        path: basePath,
      });
    }
    if (property.type === "reference") {
      if (property.referenceObjectId === undefined || property.referenceObjectId.length === 0) {
        issues.push({
          code: "invalid_property_type",
          severity: "error",
          message: `Property "${property.id}" uses type "reference" but referenceObjectId is missing`,
          path: basePath,
        });
      }
    }
  }
  return issues;
}

function validateObjectIdentifiers(object: OntologyObject): ValidationIssue[] {
  const hasPrimaryKey = object.properties.some((property) => property.role === "primary_key");
  if (!hasPrimaryKey) {
    return [
      {
        code: "missing_identifier",
        severity: "warning",
        message: `Object "${object.id}" has no property with role primary_key`,
        path: `objects[id=${object.id}]`,
      },
    ];
  }
  return [];
}

export function validateOntology(ontology: Ontology): ReturnType<typeof validationResult> {
  const parseResult = OntologySchema.safeParse(ontology);
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
      "object",
      parsed.objects.map((object) => object.id),
      "objects",
    ),
  );
  issues.push(
    ...duplicateIdIssues(
      "relationship",
      parsed.relationships.map((relationship) => relationship.id),
      "relationships",
    ),
  );
  issues.push(
    ...duplicateIdIssues(
      "logic",
      parsed.logic.map((entry) => entry.id),
      "logic",
    ),
  );
  issues.push(
    ...duplicateIdIssues(
      "action",
      parsed.actions.map((action) => action.id),
      "actions",
    ),
  );

  const objects = indexById(parsed.objects);

  for (const object of parsed.objects) {
    issues.push(
      ...duplicateIdIssues(
        "property",
        object.properties.map((property) => property.id),
        `objects[id=${object.id}].properties`,
      ),
    );
    issues.push(...validatePropertyTypes(object));
    issues.push(...validateObjectIdentifiers(object));
  }

  for (const property of parsed.objects.flatMap((object) => object.properties)) {
    if (property.referenceObjectId !== undefined && !objects.has(property.referenceObjectId)) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Property "${property.id}" references unknown object "${property.referenceObjectId}"`,
        path: `objects.properties[id=${property.id}]`,
      });
    }
  }

  for (const relationship of parsed.relationships) {
    const path = `relationships[id=${relationship.id}]`;
    if (!objects.has(relationship.fromObjectId)) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relationship "${relationship.id}" fromObjectId "${relationship.fromObjectId}" not found`,
        path,
      });
    }
    if (!objects.has(relationship.toObjectId)) {
      issues.push({
        code: "broken_relationship_target",
        severity: "error",
        message: `Relationship "${relationship.id}" toObjectId "${relationship.toObjectId}" not found`,
        path,
      });
    }
    const fromObject = objects.get(relationship.fromObjectId);
    const toObject = objects.get(relationship.toObjectId);
    if (fromObject !== undefined && relationship.fromPropertyId !== undefined) {
      if (!propertyMap(fromObject).has(relationship.fromPropertyId)) {
        issues.push({
          code: "broken_relationship_target",
          severity: "error",
          message: `Relationship "${relationship.id}" fromPropertyId "${relationship.fromPropertyId}" not found on object "${fromObject.id}"`,
          path,
        });
      }
    }
    if (toObject !== undefined && relationship.toPropertyId !== undefined) {
      if (!propertyMap(toObject).has(relationship.toPropertyId)) {
        issues.push({
          code: "broken_relationship_target",
          severity: "error",
          message: `Relationship "${relationship.id}" toPropertyId "${relationship.toPropertyId}" not found on object "${toObject.id}"`,
          path,
        });
      }
    }
  }

  for (const entry of parsed.logic) {
    if (!objects.has(entry.objectId)) {
      issues.push({
        code: "invalid_logic_reference",
        severity: "error",
        message: `Logic "${entry.id}" objectId "${entry.objectId}" not found`,
        path: `logic[id=${entry.id}]`,
      });
    }
  }

  for (const action of parsed.actions) {
    const path = `actions[id=${action.id}]`;
    if (!objects.has(action.objectId)) {
      issues.push({
        code: "invalid_action_reference",
        severity: "error",
        message: `Action "${action.id}" objectId "${action.objectId}" not found`,
        path,
      });
    }
    if (action.inputs !== undefined) {
      for (const [inputName, inputSpec] of Object.entries(action.inputs)) {
        if (!OntologyPropertyTypeSchema.safeParse(inputSpec.type).success) {
          issues.push({
            code: "invalid_action_input_schema",
            severity: "error",
            message: `Action "${action.id}" input "${inputName}" has unknown type`,
            path: `${path}.inputs.${inputName}`,
          });
        }
      }
    }
  }

  return validationResult(issues);
}
