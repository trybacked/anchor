import { z } from "zod";

export const ChangeVerdictSchema = z.enum(["auto_approve", "human_review", "recommend_reject"]);
export type ChangeVerdict = z.infer<typeof ChangeVerdictSchema>;

export const ChangeDecisionSchema = z.object({
  changeId: z.string(),
  verdict: ChangeVerdictSchema,
  reasons: z.array(z.string()),
  advisor: z
    .object({
      modelId: z.string(),
      catalogVersion: z.string(),
      accept: z.object({ answer: z.boolean().nullable(), probability: z.number() }),
      risks: z.record(z.object({ applies: z.boolean().nullable(), probability: z.number() })),
    })
    .optional(),
});
export type ChangeDecision = z.infer<typeof ChangeDecisionSchema>;

export const ProposalReviewOutcomeSchema = z.object({
  reviewer: z.string(),
  decision: z.enum(["approve", "reject"]),
  reviewedAt: z.string().datetime(),
  overridesAdvisor: z.boolean(),
});
export type ProposalReviewOutcome = z.infer<typeof ProposalReviewOutcomeSchema>;
