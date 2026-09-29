import { ObjectQuerySchema, type ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import {
  applyQueryExecutionBudget,
  QueryExecutionBudgetError,
} from "@trybacked/service";

export class SemanticPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticPlanValidationError";
  }
}

function assertObjectExists(ontology: Ontology, objectId: string): void {
  if (!ontology.objects.some((object) => object.id === objectId)) {
    throw new SemanticPlanValidationError(`Unknown object "${objectId}" in plan.`);
  }
}

function assertPropertyExists(ontology: Ontology, objectId: string, propertyId: string): void {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new SemanticPlanValidationError(`Unknown object "${objectId}" for property "${propertyId}".`);
  }
  if (!object.properties.some((property) => property.id === propertyId)) {
    throw new SemanticPlanValidationError(
      `Unknown property "${propertyId}" on object "${objectId}".`,
    );
  }
}

/** Validate normalized query against published ontology and execution budget (deterministic). */
export function validateObjectQueryAgainstOntology(
  ontology: Ontology,
  query: ObjectQuery,
): ObjectQuery {
  const parsed = ObjectQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new SemanticPlanValidationError(
      parsed.error.issues[0]?.message ?? "Invalid object query shape.",
    );
  }
  const validated = parsed.data;
  assertObjectExists(ontology, validated.objectId);
  for (const join of validated.joins ?? []) {
    const relationship = ontology.relationships.find((candidate) => candidate.id === join.relationshipId);
    if (relationship === undefined) {
      throw new SemanticPlanValidationError(`Unknown relationship "${join.relationshipId}".`);
    }
  }
  for (const filter of validated.filters) {
    const targetObject = filter.objectId ?? validated.objectId;
    assertPropertyExists(ontology, targetObject, filter.propertyId);
  }
  const groupBy = validated.groupBy ?? [];
  const aggregations = validated.aggregations ?? [];
  if (groupBy.length > 0) {
    if (aggregations.length === 0) {
      throw new SemanticPlanValidationError(
        "groupBy requires at least one aggregation (e.g. count).",
      );
    }
    if (validated.mode === "count") {
      throw new SemanticPlanValidationError(
        'Use mode "rows" with groupBy and aggregations, not mode "count".',
      );
    }
  }

  if (validated.textSearch !== undefined) {
    const searchObject = validated.textSearch.objectId ?? validated.objectId;
    assertObjectExists(ontology, searchObject);
    if (validated.textSearch.propertyIds !== undefined) {
      for (const propertyId of validated.textSearch.propertyIds) {
        assertPropertyExists(ontology, searchObject, propertyId);
      }
    }
  }
  try {
    return applyQueryExecutionBudget(validated, "semantic_chat");
  } catch (error) {
    if (error instanceof QueryExecutionBudgetError) {
      throw new SemanticPlanValidationError(error.message);
    }
    throw error;
  }
}
