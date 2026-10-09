import type { AuthoringCommandV2 } from "@trybacked/core";
import { z } from "zod";

export const ReviewPolicySchema = z.object({

  autoApproveThreshold: z.number().min(0).max(1).default(0.85),
  allowNonBreakingAutoApprove: z.boolean().default(true),
});
export type ReviewPolicy = z.infer<typeof ReviewPolicySchema>;

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = ReviewPolicySchema.parse({});

export type ReviewDecision = "auto_approve" | "human_review";

const NON_BREAKING_COMMAND_KINDS = new Set<AuthoringCommandV2["type"]>([
  "addObjectType",
  "addProperty",
  "bindDatasource",
  "addInterface",
  "addValueType",
  "addLinkType",
  "addActionType",
  "setObjectTypeSemantics",
  "setPropertySemantics",
  "upsertGlossaryTerm",
  "upsertExample",
]);

export function isBreakingCommand(command: AuthoringCommandV2): boolean {
  return !NON_BREAKING_COMMAND_KINDS.has(command.type);
}

export function classifyChange(
  change: { command: AuthoringCommandV2; confidence: number },
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): ReviewDecision {
  if (isBreakingCommand(change.command)) {
    return "human_review";
  }
  if (!policy.allowNonBreakingAutoApprove) {
    return "human_review";
  }
  return change.confidence >= policy.autoApproveThreshold ? "auto_approve" : "human_review";
}

export function partitionProposalChanges(
  changes: Array<{ command: AuthoringCommandV2; confidence: number }>,
  policy: ReviewPolicy = DEFAULT_REVIEW_POLICY,
): { autoApproved: typeof changes; requiresReview: typeof changes } {
  const autoApproved: typeof changes = [];
  const requiresReview: typeof changes = [];
  for (const change of changes) {
    if (classifyChange(change, policy) === "auto_approve") {
      autoApproved.push(change);
    } else {
      requiresReview.push(change);
    }
  }
  return { autoApproved, requiresReview };
}
