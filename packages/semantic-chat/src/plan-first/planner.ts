import type { ObjectQuery } from "@trybacked/compiler";
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

/** A stalled gateway must surface as a fallback, not an open-ended wait. */
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
};

export function buildPlannerSystemPrompt(context: PlannerContext): string {
  return [
    PLANNER_POLICY,
    PLANNER_OUTPUT_CONTRACT,
    ...buildLocaleSection(context.locale),
    ...buildConversationSection(context.history),
    ...buildSemanticContextSections(context.ontology, context.question),
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
