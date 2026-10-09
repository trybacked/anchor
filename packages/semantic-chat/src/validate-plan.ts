import {
  allowedValuesFrom,
  ObjectQuerySchema,
  objectSuggestionEntries,
  propertySuggestionEntries,
  suggestClosest,
  type ObjectQuery,
  type QueryIssue,
} from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import {
  applyQueryExecutionBudget,
  QueryExecutionBudgetError,
  zodIssuesToQueryIssues,
} from "@trybacked/service";
import { normalizeSemanticQueryPlan } from "./normalize.js";
import { applySemanticChatSelectDefault } from "./plan-defaults.js";
import type { RoutedSemanticPlan, SemanticQueryPlan } from "./plan-types.js";

export class SemanticPlanValidationError extends Error {
  readonly issues: QueryIssue[];
  constructor(message: string, issues: QueryIssue[] = []) {
    super(message);
    this.name = "SemanticPlanValidationError";
    this.issues = issues;
  }
}
function unknownObjectIssue(ontology: Ontology, objectId: string, path: string): QueryIssue {
  const entries = objectSuggestionEntries(ontology);
  return {
    code: "unknown_object",
    message: `Unknown object "${objectId}" in plan.`,
    path,
    invalidValue: objectId,
    allowed: allowedValuesFrom(entries),
    suggestions: suggestClosest(objectId, entries),
  };
}
function unknownPropertyIssue(
  ontology: Ontology,
  objectId: string,
  propertyId: string,
  path: string,
): QueryIssue {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    return unknownObjectIssue(ontology, objectId, path);
  }
  const entries = propertySuggestionEntries(object);
  return {
    code: "unknown_property",
    message: `Unknown property "${propertyId}" on object "${objectId}".`,
    path,
    invalidValue: propertyId,
    allowed: allowedValuesFrom(entries),
    suggestions: suggestClosest(propertyId, entries),
  };
}
function issueOf(code: QueryIssue["code"], message: string, path: string): QueryIssue {
  return { code, message, path };
}
function assertObjectExists(ontology: Ontology, objectId: string): void {
  if (!ontology.objects.some((object) => object.id === objectId)) {
    throw new SemanticPlanValidationError(`Unknown object "${objectId}" in plan.`, [
      unknownObjectIssue(ontology, objectId, "objectId"),
    ]);
  }
}
function assertPropertyExists(
  ontology: Ontology,
  objectId: string,
  propertyId: string,
  path: string,
): void {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new SemanticPlanValidationError(
      `Unknown object "${objectId}" for property "${propertyId}".`,
      [unknownObjectIssue(ontology, objectId, path)],
    );
  }
  if (!object.properties.some((property) => property.id === propertyId)) {
    throw new SemanticPlanValidationError(
      `Unknown property "${propertyId}" on object "${objectId}".`,
      [unknownPropertyIssue(ontology, objectId, propertyId, path)],
    );
  }
}

function validateOrdering(ontology: Ontology, query: ObjectQuery): ObjectQuery {
  if (query.mode === "count") {
    const scalar = { ...query };
    delete scalar.orderBy;
    delete scalar.orderDirection;
    return scalar;
  }
  const isBreakdown = (query.aggregations ?? []).length > 0;
  if (query.orderBy !== undefined && !isBreakdown) {
    assertProjectedPropertyExists(ontology, query.objectId, query.orderBy, "orderBy");
  }
  return query;
}

function assertProjectedPropertyExists(
  ontology: Ontology,
  rootObjectId: string,
  projected: string,
  path: string,
): void {
  const dot = projected.indexOf(".");
  if (dot > 0) {
    assertPropertyExists(ontology, projected.slice(0, dot), projected.slice(dot + 1), path);
    return;
  }
  assertPropertyExists(ontology, rootObjectId, projected, path);
}
export function validateObjectQueryAgainstOntology(
  ontology: Ontology,
  query: unknown,
): ObjectQuery {
  const parsed = ObjectQuerySchema.safeParse(query);
  if (!parsed.success) {
    const issues = zodIssuesToQueryIssues(parsed.error);
    throw new SemanticPlanValidationError(
      issues[0]?.message ?? "Object query failed validation.",
      issues,
    );
  }
  const validated = parsed.data;
  const objectId = validated.objectId;
  assertObjectExists(ontology, objectId);
  if (validated.mode === "count" && validated.textSearch !== undefined) {
    throw new SemanticPlanValidationError(
      'mode "count" cannot be combined with textSearch — use a contains filter on a string property.',
      [issueOf("invalid_query", "count mode cannot use textSearch.", "mode")],
    );
  }
  for (const filter of validated.filters) {
    const filterObjectId = filter.objectId ?? objectId;
    assertPropertyExists(ontology, filterObjectId, filter.propertyId, "filters[].propertyId");
  }
  for (const propertyId of validated.select ?? []) {
    assertProjectedPropertyExists(ontology, objectId, propertyId, "select[]");
  }
  const groupBy = validated.groupBy ?? [];
  const aggregations = validated.aggregations ?? [];
  if (groupBy.length > 0) {
    if (aggregations.length === 0) {
      throw new SemanticPlanValidationError(
        "groupBy requires at least one aggregation (e.g. count).",
        [issueOf("invalid_aggregation", "groupBy without aggregations.", "groupBy")],
      );
    }
    if (validated.mode === "count") {
      throw new SemanticPlanValidationError(
        'Use mode "rows" with groupBy and aggregations, not mode "count".',
        [issueOf("invalid_query", "count mode cannot use groupBy.", "mode")],
      );
    }
    for (const propertyId of groupBy) {
      assertProjectedPropertyExists(ontology, objectId, propertyId, "groupBy[]");
    }
  }
  const ordered = validateOrdering(ontology, validated);
  const withSelectDefault = applySemanticChatSelectDefault(ontology, ordered);
  try {
    return applyQueryExecutionBudget(withSelectDefault, "semantic_chat");
  } catch (error) {
    if (error instanceof QueryExecutionBudgetError) {
      throw new SemanticPlanValidationError(error.message, [
        issueOf("query_budget_exceeded", error.message, "query"),
      ]);
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
