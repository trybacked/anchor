import type { AuthoringCommandV2, OntologyV2 } from "@trybacked/core";
import type { DecisionAnswer, DecisionGroupResult, DecisionModel } from "@trybacked/ports";
import { DecisionModelUnavailableError } from "@trybacked/ports";
import type { ProposedChange } from "../proposal.js";
import type { ReviewPolicy } from "../review-policy.js";
import { isBreakingCommand } from "../review-policy.js";
import { buildChangeContent } from "./change-content.js";
import type { ChangeDecision } from "./change-decision.js";
import { combineChangeDecision, type AdvisorSnapshot } from "./combine-decision.js";
import type { DecisionPolicy } from "./decision-policy.js";
import { questionsForChange } from "./question-catalog.js";

export type DecideProposalChangesInput = {
  changes: Array<ProposedChange & { command: AuthoringCommandV2 }>;
  baselineOntology: OntologyV2;
  reviewPolicy: ReviewPolicy;
  decisionPolicy: DecisionPolicy;
  decisionModel?: DecisionModel | undefined;
};

function parseAdvisorFromAnswers(
  answers: readonly DecisionAnswer[],
  modelId: string,
): AdvisorSnapshot {
  let accept: AdvisorSnapshot["accept"] = { answer: null, probability: 0 };
  const risks: AdvisorSnapshot["risks"] = {};
  for (const answer of answers) {
    switch (answer.kind) {
      case "yesno":
        if (answer.id === "accept") {
          accept = { answer: answer.answer, probability: answer.probability };
        }
        break;
      case "tags":
        if (answer.id === "risks") {
          for (const [tag, value] of Object.entries(answer.tags)) {
            risks[tag] = value;
          }
        }
        break;
      default: {
        const _exhaustive: never = answer;
        throw new Error(`Unhandled decision answer kind: ${String(_exhaustive)}`);
      }
    }
  }
  return { modelId, accept, risks };
}

export async function decideProposalChanges(
  input: DecideProposalChangesInput,
): Promise<ChangeDecision[]> {
  const decisionModelConfigured = input.decisionModel !== undefined;
  const { reviewPolicy, decisionPolicy } = input;

  const results: ChangeDecision[] = [];
  const sageCandidates: Array<{
    change: DecideProposalChangesInput["changes"][number];
    content: string;
    resultIndex: number;
  }> = [];

  for (const change of input.changes) {
    const { content, withinBudget } = buildChangeContent(change, input.baselineOntology);
    const skipSage =
      !decisionModelConfigured ||
      isBreakingCommand(change.command) ||
      !withinBudget;

    const resultIndex = results.length;
    if (skipSage) {
      results.push(
        combineChangeDecision({
          changeId: change.id,
          command: change.command,
          confidence: change.confidence,
          reviewPolicy,
          decisionPolicy,
          decisionModelConfigured,
          contentTooLarge: !withinBudget,
          advisorUnavailable: false,
        }),
      );
      continue;
    }

    sageCandidates.push({ change, content, resultIndex });
    results.push(
      combineChangeDecision({
        changeId: change.id,
        command: change.command,
        confidence: change.confidence,
        reviewPolicy,
        decisionPolicy,
        decisionModelConfigured: true,
        contentTooLarge: false,
        advisorUnavailable: true,
      }),
    );
  }

  if (sageCandidates.length === 0 || input.decisionModel === undefined) {
    return results;
  }

  const groups = sageCandidates.map(({ content }) => ({
    content,
    questions: questionsForChange(decisionPolicy.blockingTags),
  }));

  let batchModelId = "unknown";
  let groupResults: DecisionGroupResult[];

  try {
    const batch = await input.decisionModel.decideBatch(groups);
    batchModelId = batch.modelId;
    groupResults = [...batch.groups];
  } catch (error) {
    if (!(error instanceof DecisionModelUnavailableError)) {
      throw error;
    }
    for (const candidate of sageCandidates) {
      results[candidate.resultIndex] = combineChangeDecision({
        changeId: candidate.change.id,
        command: candidate.change.command,
        confidence: candidate.change.confidence,
        reviewPolicy,
        decisionPolicy,
        decisionModelConfigured: true,
        contentTooLarge: false,
        advisorUnavailable: true,
      });
    }
    return results;
  }

  for (let i = 0; i < sageCandidates.length; i += 1) {
    const candidate = sageCandidates[i];
    if (candidate === undefined) {
      continue;
    }
    const groupResult = groupResults[i];
    let advisor: AdvisorSnapshot | undefined;
    let advisorUnavailable = false;

    if (groupResult === undefined || !groupResult.ok) {
      advisorUnavailable = true;
    } else {
      advisor = parseAdvisorFromAnswers(groupResult.answers, batchModelId);
    }

    results[candidate.resultIndex] = combineChangeDecision({
      changeId: candidate.change.id,
      command: candidate.change.command,
      confidence: candidate.change.confidence,
      reviewPolicy,
      decisionPolicy,
      decisionModelConfigured: true,
      contentTooLarge: false,
      advisor,
      advisorUnavailable,
    });
  }

  return results;
}

export function summarizeDecisions(decisions: readonly ChangeDecision[]): {
  autoApproved: number;
  needsReview: number;
  recommendReject: number;
} {
  let autoApproved = 0;
  let needsReview = 0;
  let recommendReject = 0;
  for (const decision of decisions) {
    switch (decision.verdict) {
      case "auto_approve":
        autoApproved += 1;
        break;
      case "human_review":
        needsReview += 1;
        break;
      case "recommend_reject":
        recommendReject += 1;
        break;
      default: {
        const _exhaustive: never = decision.verdict;
        throw new Error(`Unhandled verdict: ${String(_exhaustive)}`);
      }
    }
  }
  return { autoApproved, needsReview, recommendReject };
}
