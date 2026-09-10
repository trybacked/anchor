import { ENTITY_MENTION_TYPE } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
import { describe, expect, it, vi } from "vitest";
import { runBurst } from "../../src/burst.js";
import { enrichEntities } from "../../src/enrich-entities.js";
import type { EntityRecord, RawDocumentMention } from "../../src/extract-document-mentions.js";
import { ENGLISH_INVOICE_VOCABULARY, PROCUREMENT_VOCABULARY, } from "../fixtures/vocabulary.js";
vi.mock("../../src/burst.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/burst.js")>()),
    runBurst: vi.fn(),
}));
const mockedRunBurst = vi.mocked(runBurst);
function entity(entityId: string, name: string): EntityRecord {
    return {
        entityId,
        name,
        normalizedName: name.toUpperCase(),
        mentionCount: 3,
        documentCount: 2,
    };
}
function mention(entityId: string, normalizedValue: string, context: string): RawDocumentMention {
    return {
        documentId: "doc_a",
        mentionType: ENTITY_MENTION_TYPE,
        text: normalizedValue,
        normalizedValue,
        page: 1,
        line: 1,
        confidence: 0.9,
        context,
    };
}
function firstRequest() {
    const request = mockedRunBurst.mock.calls[0]?.[0];
    if (request === undefined) {
        throw new Error("runBurst was not called");
    }
    return request;
}
async function enrichWith(vocabulary: DomainVocabulary) {
    mockedRunBurst.mockReset();
    mockedRunBurst.mockResolvedValue({
        output: { entities: [] },
        usage: { inputTokens: 1, outputTokens: 1, costUsd: null },
    } as never);
    await enrichEntities({
        model: {} as never,
        entities: new Map([["edil_vincent_srl", entity("edil_vincent_srl", "EDIL VINCENT SRL")]]),
        mentions: [mention("edil_vincent_srl", "EDIL VINCENT SRL", "EDIL VINCENT SRL aggiudicataria")],
        vocabulary,
    });
    return firstRequest();
}
describe("enrichEntities", () => {
    it("skips the LLM when no entity was extracted", async () => {
        mockedRunBurst.mockReset();
        const entities = new Map<string, EntityRecord>();
        const result = await enrichEntities({
            model: {} as never,
            entities,
            mentions: [],
            vocabulary: PROCUREMENT_VOCABULARY,
        });
        expect(result.entities).toBe(entities);
        expect(result.usage.inputTokens).toBe(0);
        expect(mockedRunBurst).not.toHaveBeenCalled();
    });
    it("applies sector, role, summary, and confidence onto the matching entity", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                entities: [
                    {
                        entityId: "edil_vincent_srl",
                        sector: "edilizia",
                        role: "aggiudicataria",
                        summary: "Impresa edile aggiudicataria di lavori pubblici.",
                        confidence: 0.92,
                    },
                    { entityId: "sconosciuta", sector: "altro", role: "altro", summary: "", confidence: 0.1 },
                ],
            },
            usage: { inputTokens: 80, outputTokens: 20, costUsd: 0.001 },
        } as never);
        const result = await enrichEntities({
            model: {} as never,
            entities: new Map([["edil_vincent_srl", entity("edil_vincent_srl", "EDIL VINCENT SRL")]]),
            mentions: [],
            vocabulary: PROCUREMENT_VOCABULARY,
        });
        expect(result.entities.get("edil_vincent_srl")).toMatchObject({
            sector: "edilizia",
            role: "aggiudicataria",
            enrichmentConfidence: 0.92,
        });
        expect(result.entities.has("sconosciuta")).toBe(false);
        expect(result.usage.inputTokens).toBe(80);
    });
    it("puts the entity's name, counts, and context snippets in the prompt", async () => {
        const request = await enrichWith(PROCUREMENT_VOCABULARY);
        expect(request.prompt).toContain("entityId: edil_vincent_srl");
        expect(request.prompt).toContain("name: EDIL VINCENT SRL");
        expect(request.prompt).toContain("mentions: 3 across 2 document(s)");
        expect(request.prompt).toContain("EDIL VINCENT SRL aggiudicataria");
    });
});
describe("entity enrichment label space", () => {
    it("builds the schema from the corpus's own sectors and roles", async () => {
        const request = await enrichWith(PROCUREMENT_VOCABULARY);
        const parsed = request.schema.parse({
            entities: [
                {
                    entityId: "edil_vincent_srl",
                    sector: "edilizia",
                    role: "aggiudicataria",
                    summary: "Impresa edile aggiudicataria di lavori pubblici.",
                    confidence: 0.92,
                },
            ],
        }) as {
            entities: Array<{
                sector: string;
            }>;
        };
        expect(parsed.entities[0]?.sector).toBe("edilizia");
        expect(() => request.schema.parse({
            entities: [
                { entityId: "x", sector: "supplier", role: "altro", summary: "", confidence: 0.5 },
            ],
        })).toThrow();
    });
    it("swaps in another corpus's label space without touching the engine", async () => {
        const request = await enrichWith(ENGLISH_INVOICE_VOCABULARY);
        expect(request.system).toContain("vendor");
        expect(request.system).toContain("logistics");
        expect(() => request.schema.parse({
            entities: [
                { entityId: "x", sector: "logistics", role: "supplier", summary: "", confidence: 0.5 },
            ],
        })).not.toThrow();
        expect(() => request.schema.parse({
            entities: [
                { entityId: "x", sector: "edilizia", role: "supplier", summary: "", confidence: 0.5 },
            ],
        })).toThrow();
    });
});
