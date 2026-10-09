import type { ObjectQuery, QueryIssue } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import type { ConversationTurn } from "@trybacked/service";
import { generateText, type LanguageModel } from "ai";
import { QUERY_CONSTRUCTION_RULES, buildSemanticContextSections } from "../agent/prompt-builder.js";
import { buildConversationSection, buildLocaleSection } from "../conversation.js";
import { PLANNER_OUTPUT_CONTRACT, parsePlannerOutput } from "./planner-output.js";

export { PlannerOutputSchema, PlannerOutputError, type PlannerOutput } from "./planner-output.js";

const PLANNER_POLICY = [
  "You translate one natural-language question into exactly one governed ObjectQuery over the schema below. You do not answer the question yourself.",
  QUERY_CONSTRUCTION_RULES,
  "Every constraint stated in the question (topic, place, organisation, period, status) must be encoded in the query itself via filters, textSearch or joins. A constraint that is only narrated in assumptions and missing from the query is an error: the query would return unrelated rows.",
  "Set query to null only when no single query over this schema can answer the question (out of domain, needs documents, or needs several independent queries); then explain briefly in unanswerable.",
  "locale: the BCP-47 language of the question (e.g. it, en). assumptions: interpretation choices written for a non-technical reader in that language, without field or object ids.",
].join("\n");

const PLANNER_OUTPUT_REMINDER =
  "Your reply is the single JSON object defined by the output contract above and nothing else: no prose, no Markdown, no criteria line, no explanation.";

const PLANNER_TIMEOUT_MS = 20_000;

export type PlanUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type SemanticPlan =
  | {
      kind: "query";
      locale: string;
      query: ObjectQuery;
      assumptions: string[];
      usage: PlanUsage;
    }
  | {
      kind: "unanswerable";
      locale: string;
      reason: string | undefined;
      usage: PlanUsage;
    };

export type PlannerContext = {
  ontology: Ontology;
  question: string;
  locale?: string | undefined;
  history?: readonly ConversationTurn[] | undefined;

  repair?: PlanRepairContext | undefined;
};

export type PlanRepairContext = {
  previous: ObjectQuery;
  issues: readonly QueryIssue[];
};

const MAX_REPAIR_ISSUES = 8;

function serializeQueryIssue(issue: QueryIssue): string {
  const parts = [`- path: ${issue.path}`, `problem: ${issue.message}`];
  if (issue.invalidValue !== undefined) {
    parts.push(`invalid: ${JSON.stringify(issue.invalidValue)}`);
  }
  if (issue.allowed !== undefined && issue.allowed.length > 0) {
    parts.push(`allowed: ${issue.allowed.join(", ")}`);
  }
  if (issue.suggestions !== undefined && issue.suggestions.length > 0) {
    parts.push(`did you mean: ${issue.suggestions.join(", ")}`);
  }
  return parts.join("; ");
}

const REPAIR_POLICY = [
  "Your previous query was rejected by the ontology validator. The issues below name the exact path and the accepted values.",
  "Rewrite the query fixing every listed issue; keep everything else identical. Do not drop constraints unless an issue says the value does not exist in the ontology.",
].join("\n");

function buildRepairSection(repair: PlanRepairContext): string {
  return [
    "## Repair",
    `Previous query (rejected): ${JSON.stringify(repair.previous)}`,
    `Issues:\n${repair.issues.slice(0, MAX_REPAIR_ISSUES).map(serializeQueryIssue).join("\n")}`,
    REPAIR_POLICY,
  ].join("\n\n");
}

export function buildPlannerSystemPrompt(context: PlannerContext): string {
  return [
    PLANNER_POLICY,
    PLANNER_OUTPUT_CONTRACT,
    ...buildLocaleSection(context.locale),
    ...buildConversationSection(context.history),
    ...buildSemanticContextSections(context.ontology, context.question),
    ...(context.repair !== undefined ? [buildRepairSection(context.repair)] : []),
    PLANNER_OUTPUT_REMINDER,
  ].join("\n\n");
}

export async function planSemanticQuery(
  options: PlannerContext & { model: LanguageModel },
): Promise<SemanticPlan> {
  const generation = await generateText({
    model: options.model,
    system: buildPlannerSystemPrompt(options),
    prompt: options.question,
    temperature: 0,
    timeout: PLANNER_TIMEOUT_MS,
  });
  const usage: PlanUsage = {
    inputTokens: generation.usage.inputTokens ?? 0,
    outputTokens: generation.usage.outputTokens ?? 0,
    totalTokens: generation.usage.totalTokens ?? 0,
  };
  const output = parsePlannerOutput(generation.text);
  if (output.query === null) {
    return {
      kind: "unanswerable",
      locale: output.locale,
      reason: output.unanswerable ?? undefined,
      usage,
    };
  }
  return {
    kind: "query",
    locale: output.locale,
    query: output.query,
    assumptions: output.assumptions,
    usage,
  };
}
