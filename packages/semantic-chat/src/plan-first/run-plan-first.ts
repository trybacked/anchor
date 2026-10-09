import type { ObjectQuery, QueryIssue } from "@trybacked/compiler";
import { applySemanticCatalogs, type Ontology, type SemanticCatalog } from "@trybacked/core";
import { SHARED_SEMANTIC_CATALOGS } from "@trybacked/ontology-authoring";
import {
  isServiceErrorResult,
  type AnchorService,
  type ConversationTurn,
} from "@trybacked/service";
import type { LanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { PLAN_REPAIR_MAX_ATTEMPTS } from "../agent/limits.js";
import type { SemanticAgentStep, SemanticAgentUsage, SemanticAnswerClaim } from "../agent/types.js";
import { validateAgentObjectQuery } from "../query-intent.js";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
} from "../validate-plan.js";
import { planSemanticQuery, PlannerOutputError, type SemanticPlan } from "./planner.js";
import { renderPlanAnswer, type RenderableResult } from "./render-answer.js";
import { repairPlan } from "./repair-plan.js";

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

  attempts: number;
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

  locale?: string | undefined;

  history?: readonly ConversationTurn[] | undefined;
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

const RAW_OUTPUT_PREVIEW_CHARS = 240;

function describePlannerFailure(error: unknown): string {
  if (error instanceof PlannerOutputError) {
    return `planner failed: ${error.message} | raw: ${error.text.slice(0, RAW_OUTPUT_PREVIEW_CHARS)}`;
  }
  return `planner failed: ${error instanceof Error ? error.message : String(error)}`;
}

type RejectedQuery = {
  reason: string;
  issues: readonly QueryIssue[];
};

type QueryPlan = Extract<SemanticPlan, { kind: "query" }>;

async function repairOnce(
  options: RunPlanFirstOptions,
  ontology: Ontology,
  plan: QueryPlan,
  rejection: RejectedQuery,
): Promise<SemanticPlan | undefined> {
  try {
    return await repairPlan({
      previous: plan.query,
      issues: rejection.issues,
      question: options.question,
      ontology,
      model: options.model,
      locale: options.locale,
      history: options.history,
    });
  } catch {
    return undefined;
  }
}

type QueryExecution = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  sql?: string | undefined;
};

function answeredResult(
  options: RunPlanFirstOptions,
  ontology: Ontology,
  plan: QueryPlan,
  validated: ObjectQuery,
  execution: QueryExecution,
  attempts: number,
  started: number,
  queryStarted: number,
): PlanFirstOutcome {
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
    locale: options.locale ?? plan.locale,
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
      attempts,
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
    plan = await planSemanticQuery({
      ontology,
      question: options.question,
      model: options.model,
      locale: options.locale,
      history: options.history,
    });
  } catch (error) {
    return fallback(describePlannerFailure(error), undefined, started);
  }
  let attempts = 0;
  for (;;) {
    attempts += 1;
    if (plan.kind === "unanswerable") {
      return fallback(plan.reason ?? "planner declined", plan, started);
    }
    let validated: ObjectQuery | undefined;
    let rejection: RejectedQuery | undefined;
    try {
      validated = validateAgentObjectQuery(
        ontology,
        options.question,
        validateObjectQueryAgainstOntology(ontology, plan.query),
      );
    } catch (error) {
      if (error instanceof SemanticPlanValidationError) {
        rejection = { reason: `plan rejected: ${error.message}`, issues: error.issues };
      } else {
        throw error;
      }
    }
    const queryStarted = Date.now();
    let execution: QueryExecution | undefined;
    if (validated !== undefined) {
      const call = await options.service.objectQuery(validated);
      if (isServiceErrorResult(call)) {
        if (call.error.code !== "bad_request") {
          throw new Error(call.error.message);
        }
        rejection = {
          reason: `query rejected: ${call.error.message}`,
          issues: call.error.issues ?? [],
        };
      } else {
        execution = call;
      }
    }
    if (execution !== undefined && validated !== undefined) {
      return answeredResult(
        options,
        ontology,
        plan,
        validated,
        execution,
        attempts,
        started,
        queryStarted,
      );
    }
    if (attempts > PLAN_REPAIR_MAX_ATTEMPTS || rejection === undefined) {
      return fallback(rejection?.reason ?? "plan rejected", plan, started);
    }
    const repaired = await repairOnce(options, ontology, plan, rejection);
    if (repaired === undefined) {
      return fallback(rejection.reason, plan, started);
    }
    plan = repaired;
  }
}
