import { z } from "zod";
import { EntitySchema, RelationSchema, RuleSchema } from "./model.js";
import { DoubtSchema, ReviewQuestionSchema } from "./review-questions.js";

export const ProposalUsageSchema = z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nullable(),
});

export const ProposalSchema = z.object({
    runId: z.string().min(1),
    generatedAt: z.string().datetime(),
    entities: z.array(EntitySchema),
    relations: z.array(RelationSchema),
    rules: z.array(RuleSchema),
    doubts: z.array(DoubtSchema),
    questions: z.array(ReviewQuestionSchema),
    usage: ProposalUsageSchema.optional(),
});

export type ProposalUsage = z.infer<typeof ProposalUsageSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
