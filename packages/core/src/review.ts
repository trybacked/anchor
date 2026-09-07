import { z } from "zod";
import { MODEL_FORMAT_VERSION } from "./constants.js";
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
function verdictKey(kind: ReviewQuestionKind, targetId: string): string {
    return `${kind}:${targetId}`;
}
function collectVerdicts(questions: ReviewQuestion[], answers: ReviewAnswer[]): Map<string, ElementVerdict> {
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const verdicts = new Map<string, ElementVerdict>();
    for (const answer of answers) {
        const question = questionsById.get(answer.questionId);
        if (!question) {
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
    return verdicts;
}
function applyVerdict<T extends Entity | Relation | Rule>(element: T, verdict: ElementVerdict | undefined): T | null {
    if (!verdict) {
        return element;
    }
    if (verdict.rejected) {
        return null;
    }
    if (verdict.newName !== undefined) {
        return { ...element, name: verdict.newName, status: "renamed" };
    }
    return { ...element, status: "confirmed" };
}
function applyVerdicts<T extends Entity | Relation | Rule>(elements: T[], kind: ReviewQuestionKind, verdicts: Map<string, ElementVerdict>, shouldKeep: (element: T) => boolean = () => true): T[] {
    return elements
        .map((element) => applyVerdict(element, verdicts.get(verdictKey(kind, element.id))))
        .filter((element): element is T => element !== null && shouldKeep(element));
}
export function applyReview(proposal: Proposal, review: Review, now: Date = new Date()): SemanticModel {
    const verdicts = collectVerdicts(proposal.questions, review.answers);
    const entities = applyVerdicts(proposal.entities, "entity", verdicts);
    const keptEntityIds = new Set(entities.map((entity) => entity.id));
    const relations = applyVerdicts(proposal.relations, "relation", verdicts, (relation) => keptEntityIds.has(relation.fromEntity) && keptEntityIds.has(relation.toEntity));
    const rules = applyVerdicts(proposal.rules, "rule", verdicts, (rule) => keptEntityIds.has(rule.appliesTo));
    return {
        metadata: {
            formatVersion: MODEL_FORMAT_VERSION,
            runId: proposal.runId,
            generatedAt: now.toISOString(),
        },
        entities,
        relations,
        rules,
        actions: [],
    };
}
