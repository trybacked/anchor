import { z } from "zod";

export const DoubtSchema = z.object({
    topic: z.string().min(1),
    question: z.string().min(1),
    reason: z.string().min(1),
});

export const EvidenceTableSchema = z.object({
    title: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
    rows: z.array(z.array(z.string())),
});

export const ReviewQuestionKindSchema = z.enum(["entity", "relation", "rule"]);

export const ReviewQuestionSchema = z.object({
    id: z.string().min(1),
    kind: ReviewQuestionKindSchema,
    targetId: z.string().min(1),
    question: z.string().min(1),
    impact: z.number().min(0),
    uncertainty: z.number().min(0).max(1),
    risk: z.number().min(0),
    evidence: EvidenceTableSchema,
});

export type Doubt = z.infer<typeof DoubtSchema>;
export type EvidenceTable = z.infer<typeof EvidenceTableSchema>;
export type ReviewQuestionKind = z.infer<typeof ReviewQuestionKindSchema>;
export type ReviewQuestion = z.infer<typeof ReviewQuestionSchema>;
