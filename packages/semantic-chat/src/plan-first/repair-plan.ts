import type { ObjectQuery, QueryIssue } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import type { ConversationTurn } from "@trybacked/service";
import type { LanguageModel } from "ai";
import { planSemanticQuery, type SemanticPlan } from "./planner.js";

export type RepairPlanOptions = {

  previous: ObjectQuery;
  issues: readonly QueryIssue[];
  question: string;
  ontology: Ontology;
  model: LanguageModel;
  locale?: string | undefined;
  history?: readonly ConversationTurn[] | undefined;
};

export async function repairPlan(options: RepairPlanOptions): Promise<SemanticPlan> {
  return planSemanticQuery({
    ontology: options.ontology,
    question: options.question,
    model: options.model,
    locale: options.locale,
    history: options.history,
    repair: { previous: options.previous, issues: options.issues },
  });
}
