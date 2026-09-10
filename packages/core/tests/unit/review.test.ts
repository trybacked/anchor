import { describe, expect, it } from "vitest";
import { DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "../../src/constants.js";
import { applyReview, collectVerdicts } from "../../src/review.js";
import type { Entity, Relation, Rule } from "../../src/model.js";
import type { Proposal } from "../../src/proposal.js";
import type { Review } from "../../src/review.js";
import type { ReviewQuestion } from "../../src/review-questions.js";
const baseProvenance = {
    table: "customers",
    evidence: "test evidence",
};
function makeEntity(overrides: Partial<Entity> = {}): Entity {
    return {
        id: "customer",
        name: "Customer",
        sourceTable: "customers",
        status: "proposed",
        confidence: 0.99,
        provenance: baseProvenance,
        properties: [],
        ...overrides,
    };
}
function makeRelation(overrides: Partial<Relation> = {}): Relation {
    return {
        id: "invoice-customer",
        name: "Invoice to Customer",
        fromEntity: "invoice",
        toEntity: "customer",
        fromColumn: "customer_id",
        toColumn: "id",
        cardinality: "one_to_many",
        status: "proposed",
        confidence: 0.99,
        provenance: baseProvenance,
        ...overrides,
    };
}
function makeRule(overrides: Partial<Rule> = {}): Rule {
    return {
        id: "overdue",
        name: "Overdue",
        definition: "Invoice is overdue",
        appliesTo: "invoice",
        status: "proposed",
        confidence: 0.99,
        provenance: baseProvenance,
        ...overrides,
    };
}
function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
    return {
        runId: "20260101T000000-abcd",
        generatedAt: "2026-01-01T00:00:00.000Z",
        entities: [makeEntity()],
        relations: [],
        rules: [],
        doubts: [],
        questions: [],
        ...overrides,
    };
}
function makeReview(answers: Review["answers"]): Review {
    return {
        runId: "20260101T000000-abcd",
        answeredAt: "2026-01-01T00:00:01.000Z",
        answers,
    };
}
describe("collectVerdicts", () => {
    it("counts stale answers that no longer match proposal questions", () => {
        const questions: ReviewQuestion[] = [{
            id: "q-entity-customer",
            kind: "entity",
            targetId: "customer",
            question: "Confirm customer?",
            impact: 1,
            uncertainty: 0.2,
            risk: 0.2,
            evidence: { title: "Evidence", columns: ["A"], rows: [] },
        }];
        const { verdicts, staleAnswerCount } = collectVerdicts(questions, [
            { questionId: "q-entity-customer", decision: "yes" },
            { questionId: "q-entity-missing", decision: "no" },
        ]);
        expect(staleAnswerCount).toBe(1);
        expect(verdicts.get("entity:customer")).toEqual({ rejected: false, confirmed: true });
    });
});
describe("applyReview", () => {
    it("auto-confirms high-confidence elements that were not asked in review", () => {
        const proposal = makeProposal({
            entities: [
                makeEntity({ confidence: 0.99 }),
                makeEntity({ id: "invoice", name: "Invoice", sourceTable: "invoices", confidence: 0.99 }),
            ],
            relations: [makeRelation({ confidence: 0.99 })],
            rules: [makeRule({ confidence: 0.99 })],
        });
        const { model } = applyReview(proposal, makeReview([]));
        expect(model.entities[0]?.status).toBe("confirmed");
        expect(model.relations[0]?.status).toBe("confirmed");
        expect(model.rules[0]?.status).toBe("confirmed");
    });
    it("keeps low-confidence unreviewed elements as proposed", () => {
        const proposal = makeProposal({
            entities: [makeEntity({ confidence: 0.8 })],
            questions: [{
                id: "q-entity-customer",
                kind: "entity",
                targetId: "customer",
                question: "Confirm customer?",
                impact: 1,
                uncertainty: 0.2,
                risk: 0.2,
                evidence: { title: "Evidence", columns: ["A"], rows: [] },
            }],
        });
        const { model } = applyReview(proposal, makeReview([]));
        expect(model.entities[0]?.status).toBe("proposed");
    });
    it("omits rejected elements and confirms yes answers", () => {
        const proposal = makeProposal({
            entities: [
                makeEntity({ id: "customer", confidence: 0.8 }),
                makeEntity({ id: "invoice", name: "Invoice", sourceTable: "invoices", confidence: 0.8 }),
            ],
            questions: [
                {
                    id: "q-entity-customer",
                    kind: "entity",
                    targetId: "customer",
                    question: "Confirm customer?",
                    impact: 1,
                    uncertainty: 0.2,
                    risk: 0.2,
                    evidence: { title: "Evidence", columns: ["A"], rows: [] },
                },
                {
                    id: "q-entity-invoice",
                    kind: "entity",
                    targetId: "invoice",
                    question: "Confirm invoice?",
                    impact: 1,
                    uncertainty: 0.2,
                    risk: 0.2,
                    evidence: { title: "Evidence", columns: ["A"], rows: [] },
                },
            ],
        });
        const { model } = applyReview(proposal, makeReview([
            { questionId: "q-entity-customer", decision: "yes" },
            { questionId: "q-entity-invoice", decision: "no" },
        ]));
        expect(model.entities.map((entity) => entity.id)).toEqual(["customer"]);
        expect(model.entities[0]?.status).toBe("confirmed");
    });
    it("respects custom review confidence threshold for auto-confirm", () => {
        const proposal = makeProposal({
            entities: [makeEntity({ confidence: 0.96 })],
        });
        const { model } = applyReview(proposal, makeReview([]), new Date(), {
            reviewConfidenceThreshold: 0.97,
        });
        expect(model.entities[0]?.status).toBe("proposed");
    });
    it("uses default review confidence threshold", () => {
        const proposal = makeProposal({
            entities: [makeEntity({ confidence: DEFAULT_REVIEW_CONFIDENCE_THRESHOLD })],
        });
        const { model } = applyReview(proposal, makeReview([]));
        expect(model.entities[0]?.status).toBe("confirmed");
    });
});
