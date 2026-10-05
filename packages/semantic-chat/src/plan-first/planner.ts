import { ObjectQuerySchema, type ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { QUERY_CONSTRUCTION_RULES, buildSemanticContextSections } from "../agent/prompt-builder.js";

const PLANNER_POLICY = [
  "You translate one natural-language question into exactly one governed ObjectQuery over the schema below. You do not answer the question yourself.",
  QUERY_CONSTRUCTION_RULES,
  "Every constraint stated in the question (topic, place, organisation, period, status) must be encoded in the query itself via filters, textSearch or joins. A constraint that is only narrated in assumptions and missing from the query is an error: the query would return unrelated rows.",
  "Set query to null only when no single query over this schema can answer the question (out of domain, needs documents, or needs several independent queries); then explain briefly in unanswerable.",
  "locale: the BCP-47 language of the question (e.g. it, en). assumptions: interpretation choices written for a non-technical reader in that language, without field or object ids.",
].join("\n");

/** A stalled gateway must surface as a fallback, not an open-ended wait. */
const PLANNER_TIMEOUT_MS = 20_000;

export const PlannerOutputSchema = z.object({
  locale: z.string().min(2).max(8).describe("Language of the question, BCP-47 (e.g. it, en)"),
  // Strict: a filter placed under an unknown key must fail the plan, not be
  // silently dropped into a query that returns everything.
  query: ObjectQuerySchema.strict()
    .nullable()
    .describe("The single governed query answering the question, or null when impossible"),
  unanswerable: z
    .string()
    .nullable()
    .describe("When query is null: one short sentence, user's language, why it cannot be answered"),
  assumptions: z
    .array(z.string())
    .describe("Interpretation choices in plain language (no field ids), may be empty"),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

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

export function buildPlannerSystemPrompt(ontology: Ontology, question: string): string {
  return [PLANNER_POLICY, ...buildSemanticContextSections(ontology, question)].join("\n\n");
}

export async function planSemanticQuery(options: {
  ontology: Ontology;
  question: string;
  model: LanguageModel;
}): Promise<SemanticPlan> {
  const generation = await generateText({
    model: options.model,
    output: Output.object({ schema: PlannerOutputSchema }),
    system: buildPlannerSystemPrompt(options.ontology, options.question),
    prompt: options.question,
    temperature: 0,
    timeout: PLANNER_TIMEOUT_MS,
  });
  const usage: PlanUsage = {
    inputTokens: generation.usage.inputTokens ?? 0,
    outputTokens: generation.usage.outputTokens ?? 0,
    totalTokens: generation.usage.totalTokens ?? 0,
  };
  const output = generation.output;
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
