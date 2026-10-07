import { ObjectQuerySchema, type ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import { applyQueryExecutionBudget, QueryExecutionBudgetError } from "@trybacked/service";
import { normalizeSemanticQueryPlan } from "./normalize.js";
import { applySemanticChatSelectDefault } from "./plan-defaults.js";
import type { RoutedSemanticPlan, SemanticQueryPlan } from "./plan-types.js";
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
    throw new SemanticPlanValidationError(
      `Unknown object "${objectId}" for property "${propertyId}".`,
    );
  }
  if (!object.properties.some((property) => property.id === propertyId)) {
    throw new SemanticPlanValidationError(
      `Unknown property "${propertyId}" on object "${objectId}".`,
    );
  }
}
/**
 * A scalar count has no ordering. Breakdowns sort by a projected column
 * (the compiler enforces this), plain listings by a real property.
 */
function validateOrdering(ontology: Ontology, query: ObjectQuery): ObjectQuery {
  if (query.mode === "count") {
    const scalar = { ...query };
    delete scalar.orderBy;
    delete scalar.orderDirection;
    return scalar;
  }
  const isBreakdown = (query.aggregations ?? []).length > 0;
  if (query.orderBy !== undefined && !isBreakdown) {
    assertProjectedPropertyExists(ontology, query.objectId, query.orderBy);
  }
  return query;
}
/** Accepts a root property id or `objectId.propertyId` for a joined column. */
function assertProjectedPropertyExists(
  ontology: Ontology,
  rootObjectId: string,
  projected: string,
): void {
  const dot = projected.indexOf(".");
  if (dot > 0) {
    assertPropertyExists(ontology, projected.slice(0, dot), projected.slice(dot + 1));
    return;
  }
  assertPropertyExists(ontology, rootObjectId, projected);
}
export function validateObjectQueryAgainstOntology(
  ontology: Ontology,
  query: unknown,
): ObjectQuery {
  const parsed = ObjectQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new SemanticPlanValidationError(
      parsed.error.issues[0]?.message ?? "Object query failed validation.",
    );
  }
  const validated = parsed.data;
  const objectId = validated.objectId;
  assertObjectExists(ontology, objectId);
  if (validated.mode === "count" && validated.textSearch !== undefined) {
    throw new SemanticPlanValidationError(
      'mode "count" cannot be combined with textSearch — use a contains filter on a string property.',
    );
  }
  for (const filter of validated.filters) {
    const filterObjectId = filter.objectId ?? objectId;
    assertPropertyExists(ontology, filterObjectId, filter.propertyId);
  }
  for (const propertyId of validated.select ?? []) {
    assertProjectedPropertyExists(ontology, objectId, propertyId);
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
    for (const propertyId of groupBy) {
      assertProjectedPropertyExists(ontology, objectId, propertyId);
    }
  }
  const ordered = validateOrdering(ontology, validated);
  const withSelectDefault = applySemanticChatSelectDefault(ontology, ordered);
  try {
    return applyQueryExecutionBudget(withSelectDefault, "semantic_chat");
  } catch (error) {
    if (error instanceof QueryExecutionBudgetError) {
      throw new SemanticPlanValidationError(error.message);
    }
    throw error;
  }
}
function routedPlanToSemanticPlan(plan: RoutedSemanticPlan): SemanticQueryPlan {
  if (plan.objectQuery === undefined) {
    throw new SemanticPlanValidationError('route "single" requires objectQuery.');
  }
  return {
    ...(plan.reasoning !== undefined ? { reasoning: plan.reasoning } : {}),
    objectQuery: plan.objectQuery,
    ...(plan.objectSet !== undefined ? { objectSet: plan.objectSet } : {}),
  };
}
export type ValidatedRoutedPlan = {
  route: "single";
  semanticPlan: SemanticQueryPlan;
};
export function validateRoutedPlan(
  ontology: Ontology,
  plan: RoutedSemanticPlan,
): ValidatedRoutedPlan {
  if (plan.route !== "single") {
    throw new SemanticPlanValidationError(
      'Only route "single" is supported; use the semantic agent for multi-step questions.',
    );
  }
  const semanticPlan = routedPlanToSemanticPlan(plan);
  validateObjectQueryAgainstOntology(
    ontology,
    normalizeSemanticQueryPlan(semanticPlan).objectQuery,
  );
  return { route: "single", semanticPlan };
}
