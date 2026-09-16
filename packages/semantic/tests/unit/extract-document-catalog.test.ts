import { describe, expect, it, vi } from "vitest";
import { runBurst } from "../../src/burst.js";
import { inferDocumentTypeHint } from "../../src/document-type-hints.js";
import { extractDocumentCatalog } from "../../src/extract-document-catalog.js";
import { SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE } from "../fixtures/document-type-hints.js";
import { PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";

vi.mock("../../src/burst.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/burst.js")>()),
    runBurst: vi.fn(),
    sumBurstUsage: (await importOriginal<typeof import("../../src/burst.js")>()).sumBurstUsage,
}));
const mockedRunBurst = vi.mocked(runBurst);
const mockModels = {
    language: {} as never,
    embedding: {} as never,
};

describe("inferDocumentTypeHint", () => {
    it("maps determination slugs from workspace rules", () => {
        expect(inferDocumentTypeHint("determinazioni_set_amm_n_251_2026_gen_741", SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE)?.documentType).toBe("determination");
    });
    it("maps avviso slugs from workspace rules", () => {
        expect(inferDocumentTypeHint("documento_avviso_suap", SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE)?.documentType).toBe("notice");
    });
    it("returns null without workspace rules", () => {
        expect(inferDocumentTypeHint("documento_avviso_suap", undefined)).toBeNull();
        expect(inferDocumentTypeHint("documento_avviso_suap", [])).toBeNull();
    });
    it("leaves opaque PDF slugs like aspc982920 on the LLM path (not a CSV misroute)", () => {
        expect(inferDocumentTypeHint("aspc982920", SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE)).toBeNull();
    });
});

describe("extractDocumentCatalog", () => {
    it("skips LLM for documents with strong slug hints", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documentType: "unknown",
                documentTypeLabel: "Unknown",
                fields: [],
                confidence: 0.5,
            },
            usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        });
        const { catalog } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            documentTypeHints: SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE,
            samples: [
                {
                    sourceTable: "determinazioni_set_amm_n_251_2026_gen_741",
                    headerLines: ["Determina comunale"],
                    pageCount: 2,
                },
                {
                    sourceTable: "documento_avviso",
                    headerLines: ["AVVISO"],
                    pageCount: 1,
                },
            ],
        });
        expect(mockedRunBurst).not.toHaveBeenCalled();
        expect(catalog.documents).toHaveLength(2);
        expect(catalog.documents[0]?.documentType).toBe("determination");
        expect(catalog.documents[1]?.documentType).toBe("notice");
    });
    it("extracts vocabulary identifier fields on the deterministic path", async () => {
        mockedRunBurst.mockReset();
        const { catalog } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            documentTypeHints: SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE,
            vocabulary: PROCUREMENT_VOCABULARY,
            samples: [{
                sourceTable: "determina_del_10_08_2026",
                headerLines: ["Determina di affidamento CIG 1234567890"],
                pageCount: 1,
            }],
        });
        expect(catalog.documents[0]?.fields.cig?.value).toBe("1234567890");
    });
    it("calls LLM only for ambiguous documents", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documentType: "notice",
                documentTypeLabel: "Notice",
                fields: [{ key: "reference_number", value: "123" }],
                confidence: 0.9,
            },
            usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
        });
        const { catalog } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            samples: [
                {
                    sourceTable: "aspc982920",
                    headerLines: ["Header"],
                    pageCount: 1,
                },
            ],
        });
        expect(mockedRunBurst).toHaveBeenCalledTimes(1);
        expect(catalog.documents[0]?.fields.reference_number?.value).toBe("123");
    });
    it("surfaces extraction failure with source table provenance", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockRejectedValue(new Error("No object generated: response did not match schema"));
        await expect(extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            samples: [
                {
                    sourceTable: "aspc982920",
                    headerLines: ["Header A"],
                    pageCount: 2,
                },
            ],
        })).rejects.toThrow('Document extraction failed for batch [aspc982920]');
    });
    it("batches multiple ambiguous documents into one LLM call", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documents: [
                    {
                        sourceTable: "doc_a",
                        documentType: "notice",
                        documentTypeLabel: "Notice",
                        fields: [{ key: "reference_number", value: "1" }],
                        confidence: 0.9,
                    },
                    {
                        sourceTable: "doc_b",
                        documentType: "notice",
                        documentTypeLabel: "Notice",
                        fields: [{ key: "reference_number", value: "2" }],
                        confidence: 0.9,
                    },
                ],
            },
            usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
        });
        const { catalog } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            samples: [
                { sourceTable: "doc_a", headerLines: ["Header A"], pageCount: 1 },
                { sourceTable: "doc_b", headerLines: ["Header B"], pageCount: 1 },
            ],
        });
        expect(mockedRunBurst).toHaveBeenCalledTimes(1);
        expect(catalog.documents).toHaveLength(2);
    });
    it("reuses cached catalog entries when the header fingerprint is unchanged", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documentType: "notice",
                documentTypeLabel: "Notice",
                fields: [{ key: "reference_number", value: "123" }],
                confidence: 0.9,
            },
            usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
        });
        const sample = {
            sourceTable: "aspc982920",
            headerLines: ["Header"],
            pageCount: 1,
        };
        const { catalog: first } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            samples: [sample],
        });
        mockedRunBurst.mockClear();
        const fingerprint = first.documents[0]?.headerFingerprint;
        expect(fingerprint).toBeDefined();
        const { catalog: second } = await extractDocumentCatalog({
            runId: "test-run-2",
            models: mockModels,
            samples: [sample],
            catalogCache: new Map([
                [
                    sample.sourceTable,
                    {
                        entry: first.documents[0]!,
                        headerFingerprint: fingerprint!,
                    },
                ],
            ]),
        });
        expect(mockedRunBurst).not.toHaveBeenCalled();
        expect(second.documents[0]?.documentType).toBe(first.documents[0]?.documentType);
    });
    it("preserves canonical documentType from the type registry", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documentType: "published_act",
                documentTypeLabel: "Published act",
                fields: [],
                confidence: 0.9,
            },
            usage: { inputTokens: 10, outputTokens: 5, costUsd: null },
        });
        const { catalog } = await extractDocumentCatalog({
            runId: "test-run",
            models: mockModels,
            samples: [{
                sourceTable: "doc_a",
                headerLines: ["Changed header"],
                pageCount: 1,
            }],
            typeRegistry: new Map([
                ["doc_a", { documentType: "publication", documentTypeLabel: "Publication" }],
            ]),
        });
        expect(mockedRunBurst).not.toHaveBeenCalled();
        expect(catalog.documents[0]?.documentType).toBe("publication");
    });
});
