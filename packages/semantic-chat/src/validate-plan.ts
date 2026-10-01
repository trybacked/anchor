import { ObjectQuerySchema, type ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import {
  applyQueryExecutionBudget,
  assertAggregateRowBudget,
  QueryExecutionBudgetError,
} from "@trybacked/service";
import {
  collectTemplateRowLimits,
  instantiatePlanTemplate,
  type InstantiatedPlan,
} from "./instantiate-template.js";
import { normalizeSemanticQueryPlan } from "./normalize.js";
import type { RoutedSemanticPlan, SemanticQueryPlan } from "./plan-types.js";
import type { PlanTemplateRegistry } from "./template-registry.js";

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
    const relationship = ontology.relationships.find(
      (candidate) => candidate.id === join.relationshipId,
    );
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

export type ValidatedTemplateExecution = {
  route: "template";
  templateId: string;
  instantiated: InstantiatedPlan;
};

export type ValidatedRoutedPlan =
  { route: "single"; semanticPlan: SemanticQueryPlan } | ValidatedTemplateExecution;

/** Validate LLM routed plan: single object query or known template + params. */
export function validateRoutedPlan(
  ontology: Ontology,
  registry: PlanTemplateRegistry,
  plan: RoutedSemanticPlan,
): ValidatedRoutedPlan {
  if (plan.route === "single") {
    const semanticPlan = routedPlanToSemanticPlan(plan);
    return { route: "single", semanticPlan };
  }

  const templateId = plan.templateId;
  if (templateId === undefined) {
    throw new SemanticPlanValidationError('route "template" requires templateId.');
  }
  const template = registry.get(templateId);
  if (template === undefined) {
    throw new SemanticPlanValidationError(`Unknown plan template "${templateId}".`);
  }

  const params = plan.params ?? {};
  let instantiated: InstantiatedPlan;
  try {
    instantiated = instantiatePlanTemplate(template, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SemanticPlanValidationError(message);
  }

  try {
    assertAggregateRowBudget(collectTemplateRowLimits(instantiated.steps), "semantic_chat");
  } catch (error) {
    if (error instanceof QueryExecutionBudgetError) {
      throw new SemanticPlanValidationError(error.message);
    }
    throw error;
  }

  for (const step of instantiated.steps) {
    if (step.type !== "objectQuery") {
      continue;
    }
    validateObjectQueryAgainstOntology(
      ontology,
      normalizeSemanticQueryPlan({ objectQuery: step.query }).objectQuery,
    );
  }

  return { route: "template", templateId, instantiated };
}
