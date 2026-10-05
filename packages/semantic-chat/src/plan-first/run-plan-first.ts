import { applySemanticCatalogs, type Ontology, type SemanticCatalog } from "@trybacked/core";
import { SHARED_SEMANTIC_CATALOGS } from "@trybacked/ontology-authoring";
import { isServiceErrorResult, type AnchorService } from "@trybacked/service";
import type { LanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import type { SemanticAgentStep, SemanticAgentUsage, SemanticAnswerClaim } from "../agent/types.js";
import { validateAgentObjectQuery } from "../query-intent.js";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
} from "../validate-plan.js";
import { planSemanticQuery, type SemanticPlan } from "./planner.js";
import { renderPlanAnswer, type RenderableResult } from "./render-answer.js";

const PLAN_QUERY_TOOL_CALL_ID = "plan-query";

export type PlanFirstResult = {
  runId: string;
  answer: string;
  claims: SemanticAnswerClaim[];
  assumptions: string[];
  plan: Record<string, unknown>;
  result: RenderableResult & { sql: string };
  steps: SemanticAgentStep[];
  usage: SemanticAgentUsage;
};

export type PlanFirstOutcome =
  | {
      kind: "answered";
      result: PlanFirstResult;
    }
  | {
      kind: "fallback";
      reason: string;
      usage: SemanticAgentUsage;
    };

export type RunPlanFirstOptions = {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  model: LanguageModel;
  semanticCatalogs?: readonly SemanticCatalog[] | undefined;
};

function fallback(
  reason: string,
  plan: SemanticPlan | undefined,
  started: number,
): PlanFirstOutcome {
  return {
    kind: "fallback",
    reason,
    usage: {
      inputTokens: plan?.usage.inputTokens ?? 0,
      outputTokens: plan?.usage.outputTokens ?? 0,
      totalTokens: plan?.usage.totalTokens ?? 0,
      latencyMs: Date.now() - started,
    },
  };
}

export async function runPlanFirst(options: RunPlanFirstOptions): Promise<PlanFirstOutcome> {
  const started = Date.now();
  const ontology = applySemanticCatalogs(
    options.ontology,
    options.semanticCatalogs ?? SHARED_SEMANTIC_CATALOGS,
  );
  let plan: SemanticPlan;
  try {
    plan = await planSemanticQuery({ ontology, question: options.question, model: options.model });
  } catch (error) {
    return fallback(
      `planner failed: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      started,
    );
  }
  if (plan.kind === "unanswerable") {
    return fallback(plan.reason ?? "planner declined", plan, started);
  }
  let validated;
  try {
    validated = validateAgentObjectQuery(
      ontology,
      options.question,
      validateObjectQueryAgainstOntology(ontology, plan.query),
    );
  } catch (error) {
    if (error instanceof SemanticPlanValidationError) {
      return fallback(`plan rejected: ${error.message}`, plan, started);
    }
    throw error;
  }
  const queryStarted = Date.now();
  const execution = await options.service.objectQuery(validated);
  if (isServiceErrorResult(execution)) {
    if (execution.error.code === "bad_request") {
      return fallback(`query rejected: ${execution.error.message}`, plan, started);
    }
    throw new Error(execution.error.message);
  }
  const result: RenderableResult & { sql: string } = {
    objectId: execution.objectId,
    columns: execution.columns,
    rows: execution.rows,
    rowCount: execution.rowCount,
    mode: validated.mode ?? "rows",
    sql: execution.sql ?? "",
  };
  const rendered = renderPlanAnswer({
    ontology,
    query: validated,
    result,
    locale: plan.locale,
    toolCallId: PLAN_QUERY_TOOL_CALL_ID,
  });
  return {
    kind: "answered",
    result: {
      runId: randomUUID(),
      answer: rendered.text,
      claims: rendered.claims,
      assumptions: plan.assumptions,
      plan: { objectQuery: validated },
      result,
      steps: [
        {
          toolCallId: PLAN_QUERY_TOOL_CALL_ID,
          toolName: "query_objects",
          input: validated,
          status: "ok",
          rowCount: execution.rowCount,
          sql: result.sql,
          durationMs: Date.now() - queryStarted,
        },
      ],
      usage: { ...plan.usage, latencyMs: Date.now() - started },
    },
  };
}
