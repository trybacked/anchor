import { z } from "zod";
import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD, MODEL_FORMAT_VERSION } from "./constants.js";
import type { Entity, Relation, Rule, SemanticModel } from "./model.js";
import type { Proposal, ReviewQuestion, ReviewQuestionKind } from "./proposal.js";
export const ReviewDecisionSchema = z.enum(["yes", "no", "rename"]);
export const ReviewAnswerSchema = z
    .object({
    questionId: z.string().min(1),
    decision: ReviewDecisionSchema,
    newName: z.string().min(1).optional(),
})
    .refine((answer) => answer.decision !== "rename" || answer.newName !== undefined, {
    message: "A 'rename' answer requires newName",
});
export const ReviewSchema = z.object({
    runId: z.string().min(1),
    answeredAt: z.string().datetime(),
    answers: z.array(ReviewAnswerSchema),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type ReviewAnswer = z.infer<typeof ReviewAnswerSchema>;
export type Review = z.infer<typeof ReviewSchema>;
interface ElementVerdict {
    rejected: boolean;
    confirmed: boolean;
    newName?: string;
}
export interface CollectVerdictsResult {
    verdicts: Map<string, ElementVerdict>;
    staleAnswerCount: number;
}
export interface ApplyReviewOptions {
    reviewConfidenceThreshold?: number;
}
export interface ApplyReviewResult {
    model: SemanticModel;
    staleAnswerCount: number;
}
function verdictKey(kind: ReviewQuestionKind, targetId: string): string {
    return `${kind}:${targetId}`;
}
function buildReviewedTargetKeys(questions: ReviewQuestion[]): Set<string> {
    return new Set(questions.map((question) => verdictKey(question.kind, question.targetId)));
}
export function collectVerdicts(questions: ReviewQuestion[], answers: ReviewAnswer[]): CollectVerdictsResult {
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const verdicts = new Map<string, ElementVerdict>();
    let staleAnswerCount = 0;
    for (const answer of answers) {
        const question = questionsById.get(answer.questionId);
        if (!question) {
            staleAnswerCount += 1;
            continue;
        }
        const key = verdictKey(question.kind, question.targetId);
        switch (answer.decision) {
            case "yes": {
                verdicts.set(key, { rejected: false, confirmed: true });
                break;
            }
            case "no": {
                verdicts.set(key, { rejected: true, confirmed: false });
                break;
            }
            case "rename": {
                const verdict: ElementVerdict = { rejected: false, confirmed: true };
                if (answer.newName !== undefined) {
                    verdict.newName = answer.newName;
                }
                verdicts.set(key, verdict);
                break;
            }
            default: {
                const _exhaustive: never = answer.decision;
                throw new Error(`Unhandled review decision: ${String(_exhaustive)}`);
            }
        }
    }
    return { verdicts, staleAnswerCount };
}
function applyVerdict<T extends Entity | Relation | Rule>(element: T, verdict: ElementVerdict | undefined, wasReviewed: boolean, reviewConfidenceThreshold: number): T | null {
    if (verdict !== undefined) {
        if (verdict.rejected) {
            return null;
        }
        if (verdict.newName !== undefined) {
            return { ...element, name: verdict.newName, status: "renamed" };
        }
        return { ...element, status: "confirmed" };
    }
    if (!wasReviewed && element.confidence >= reviewConfidenceThreshold) {
        return { ...element, status: "confirmed" };
    }
    return element;
}
function applyVerdicts<T extends Entity | Relation | Rule>(elements: T[], kind: ReviewQuestionKind, verdicts: Map<string, ElementVerdict>, reviewedTargetKeys: Set<string>, reviewConfidenceThreshold: number, shouldKeep: (element: T) => boolean = () => true): T[] {
    return elements
        .map((element) => applyVerdict(element, verdicts.get(verdictKey(kind, element.id)), reviewedTargetKeys.has(verdictKey(kind, element.id)), reviewConfidenceThreshold))
        .filter((element): element is T => element !== null && shouldKeep(element));
}
export function applyReview(proposal: Proposal, review: Review, now: Date = new Date(), options: ApplyReviewOptions = {}): ApplyReviewResult {
    const reviewConfidenceThreshold = options.reviewConfidenceThreshold ?? DEFAULT_REVIEW_CONFIDENCE_THRESHOLD;
    const { verdicts, staleAnswerCount } = collectVerdicts(proposal.questions, review.answers);
    const reviewedTargetKeys = buildReviewedTargetKeys(proposal.questions);
    const entities = applyVerdicts(proposal.entities, "entity", verdicts, reviewedTargetKeys, reviewConfidenceThreshold);
    const keptEntityIds = new Set(entities.map((entity) => entity.id));
    const relations = applyVerdicts(proposal.relations, "relation", verdicts, reviewedTargetKeys, reviewConfidenceThreshold, (relation) => keptEntityIds.has(relation.fromEntity) && keptEntityIds.has(relation.toEntity));
    const rules = applyVerdicts(proposal.rules, "rule", verdicts, reviewedTargetKeys, reviewConfidenceThreshold, (rule) => keptEntityIds.has(rule.appliesTo));
    return {
        model: {
            metadata: {
                formatVersion: MODEL_FORMAT_VERSION,
                runId: proposal.runId,
                generatedAt: now.toISOString(),
            },
            entities,
            relations,
            rules,
        },
        staleAnswerCount,
    };
}
