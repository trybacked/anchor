import type { AuthoringCommandV2 } from "@trybacked/core";
import { classifyChange, isBreakingCommand } from "../review-policy.js";
import type { ReviewPolicy } from "../review-policy.js";
import type { ChangeDecision } from "./change-decision.js";
import type { DecisionPolicy } from "./decision-policy.js";
import type { RiskTag } from "./question-catalog.js";
import { CATALOG_VERSION } from "./question-catalog.js";

export type AdvisorSnapshot = {
  modelId: string;
  accept: { answer: boolean | null; probability: number };
  risks: Record<string, { applies: boolean | null; probability: number }>;
};

export type CombineChangeDecisionInput = {
  changeId: string;
  command: AuthoringCommandV2;
  confidence: number;
  reviewPolicy: ReviewPolicy;
  decisionPolicy: DecisionPolicy;
  decisionModelConfigured: boolean;
  contentTooLarge: boolean;
  advisor?: AdvisorSnapshot | undefined;
  advisorUnavailable: boolean;
};

function legacyVerdict(
  change: { command: AuthoringCommandV2; confidence: number },
  reviewPolicy: ReviewPolicy,
): ChangeDecision["verdict"] {
  return classifyChange(change, reviewPolicy) === "auto_approve" ? "auto_approve" : "human_review";
}

function blockingRiskHit(
  risks: Record<string, { applies: boolean | null; probability: number }>,
  blockingTags: readonly RiskTag[],
): string | undefined {
  for (const tag of blockingTags) {
    const entry = risks[tag];
    if (entry?.applies === true) {
      return `risk:${tag}`;
    }
  }
  return undefined;
}

export function combineChangeDecision(input: CombineChangeDecisionInput): ChangeDecision {
  const useLegacy = !input.decisionModelConfigured || input.contentTooLarge;

  if (useLegacy) {
    const reasons: string[] = [];
    if (input.contentTooLarge) {
      reasons.push("content_too_large");
    }
    if (isBreakingCommand(input.command)) {
      reasons.push("breaking");
    }
    const verdict = legacyVerdict(
      { command: input.command, confidence: input.confidence },
      input.reviewPolicy,
    );
    if (reasons.length === 0 && verdict === "human_review" && isBreakingCommand(input.command)) {
      reasons.push("breaking");
    }
    return {
      changeId: input.changeId,
      verdict,
      reasons,
    };
  }

  if (isBreakingCommand(input.command)) {
    return { changeId: input.changeId, verdict: "human_review", reasons: ["breaking"] };
  }

  if (input.advisorUnavailable || input.advisor === undefined) {
    return {
      changeId: input.changeId,
      verdict: "human_review",
      reasons: ["decision_unavailable"],
    };
  }

  const advisorBlock = {
    modelId: input.advisor.modelId,
    catalogVersion: CATALOG_VERSION,
    accept: input.advisor.accept,
    risks: input.advisor.risks,
  };

  const { accept, risks } = input.advisor;

  if (accept.answer === null) {
    return {
      changeId: input.changeId,
      verdict: "human_review",
      reasons: ["undecided"],
      advisor: advisorBlock,
    };
  }

  if (!accept.answer && 1 - accept.probability >= input.decisionPolicy.rejectThreshold) {
    return {
      changeId: input.changeId,
      verdict: "recommend_reject",
      reasons: ["advisor_reject"],
      advisor: advisorBlock,
    };
  }

  const riskReason = blockingRiskHit(risks, input.decisionPolicy.blockingTags);
  if (riskReason !== undefined) {
    return {
      changeId: input.changeId,
      verdict: "human_review",
      reasons: [riskReason],
      advisor: advisorBlock,
    };
  }

  const canAutoApprove =
    input.decisionModelConfigured &&
    accept.answer &&
    accept.probability >= input.decisionPolicy.acceptThreshold &&
    input.confidence >= input.reviewPolicy.autoApproveThreshold &&
    input.reviewPolicy.allowNonBreakingAutoApprove;

  if (canAutoApprove) {
    return {
      changeId: input.changeId,
      verdict: "auto_approve",
      reasons: ["policy_gate"],
      advisor: advisorBlock,
    };
  }

  return {
    changeId: input.changeId,
    verdict: "human_review",
    reasons: ["needs_review"],
    advisor: advisorBlock,
  };
}
