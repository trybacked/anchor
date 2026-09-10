import type { DocumentCatalogEntry } from "@backed/core";
import { EMPTY_DOMAIN_VOCABULARY } from "@backed/core";
import { describe, expect, it, vi } from "vitest";
import { runBurst } from "../../src/burst.js";
import { buildDocumentEnrichmentPrompt, buildDocumentTopicSample, buildDocumentTopicSamples, DOCUMENT_ENRICHMENT_BATCH_SIZE, enrichDocuments, findBoilerplateLines, } from "../../src/enrich-documents.js";
import type { DocumentLineRow } from "../../src/extract-document-mentions.js";
import { ITALIAN_PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";
vi.mock("../../src/burst.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/burst.js")>()),
    runBurst: vi.fn(),
}));
const mockedRunBurst = vi.mocked(runBurst);
const LETTERHEAD = "COMUNE DI GERACE - UFFICIO TECNICO";
const FOOTER = "Documento firmato digitalmente - pag. 1 di 4";
function corpusRows(): DocumentLineRow[] {
    return ["appalto strada", "tributi IMU", "avviso elettorale", "appalto scuola", "bando cultura"]
        .flatMap((subject, index) => {
        const documentId = `doc_${String(index)}`;
        return [
            { document_id: documentId, page: 1, line: 1, text: LETTERHEAD },
            { document_id: documentId, page: 1, line: 2, text: `Oggetto: ${subject}` },
            {
                document_id: documentId,
                page: 1,
                line: 3,
                text: `Documento firmato digitalmente - pag. 1 di ${String(index + 2)}`,
            },
        ];
    });
}
function documentEntry(sourceTable: string, subject: string): DocumentCatalogEntry {
    return {
        sourceTable,
        documentType: "determination",
        documentTypeLabel: "Determination",
        subject: { value: subject, confidence: 0.9 },
        confidence: 0.9,
        pageCount: 3,
    };
}
describe("findBoilerplateLines", () => {
    it("marks lines repeated across most documents, ignoring their digits", () => {
        const boilerplate = findBoilerplateLines(corpusRows());
        expect(boilerplate.has("comune di gerace - ufficio tecnico")).toBe(true);
        expect(boilerplate.has("documento firmato digitalmente - pag. # di #")).toBe(true);
        expect(boilerplate.has("oggetto: appalto strada")).toBe(false);
    });
    it("stays empty on a corpus too small for frequency analysis", () => {
        const rows = corpusRows().filter((row) => row.document_id === "doc_0");
        expect(findBoilerplateLines(rows).size).toBe(0);
    });
});
describe("buildDocumentTopicSample", () => {
    it("drops the corpus's recurring lines and keeps document-specific ones", () => {
        const boilerplate = findBoilerplateLines(corpusRows());
        const sample = buildDocumentTopicSample([LETTERHEAD, "Oggetto: appalto strada finanziato dal PNRR", FOOTER], boilerplate);
        expect(sample).toBe("Oggetto: appalto strada finanziato dal PNRR");
    });
    it("keeps every substantive line when nothing recurs", () => {
        const sample = buildDocumentTopicSample(["   ", "AVVISO DI CONVOCAZIONE", "Si rende noto"], new Set());
        expect(sample).toBe("AVVISO DI CONVOCAZIONE Si rende noto");
    });
    it("caps the excerpt length", () => {
        const sample = buildDocumentTopicSample(Array.from({ length: 40 }, () => "lavori di manutenzione straordinaria della strada comunale"), new Set());
        expect(sample.length).toBeLessThanOrEqual(700);
    });
});
describe("buildDocumentTopicSamples", () => {
    it("groups lines per document and excludes corpus furniture", () => {
        const samples = buildDocumentTopicSamples(corpusRows());
        expect(samples.get("doc_0")).toBe("Oggetto: appalto strada");
        expect(samples.get("doc_1")).toBe("Oggetto: tributi IMU");
    });
    it("preserves line order within a document", () => {
        const samples = buildDocumentTopicSamples([
            { document_id: "doc_a", page: 1, line: 1, text: "Oggetto: appalto strada" },
            { document_id: "doc_b", page: 1, line: 1, text: "Oggetto: tributi IMU" },
            { document_id: "doc_a", page: 1, line: 2, text: "CIG Z123456789" },
        ]);
        expect(samples.get("doc_a")).toBe("Oggetto: appalto strada CIG Z123456789");
    });
});
describe("buildDocumentEnrichmentPrompt", () => {
    it("includes id, type, and body excerpt for each document", () => {
        const prompt = buildDocumentEnrichmentPrompt([
            {
                documentId: "doc_a",
                documentTypeLabel: "Determination",
                sample: "Oggetto: Affidamento lavori PNRR",
            },
        ]);
        expect(prompt).toContain("documentId: doc_a");
        expect(prompt).toContain("type: Determination");
        expect(prompt).toContain("text: Oggetto: Affidamento lavori PNRR");
    });
    it("marks a missing excerpt instead of emitting an empty field", () => {
        const prompt = buildDocumentEnrichmentPrompt([
            { documentId: "doc_b", documentTypeLabel: "Notice", sample: "" },
        ]);
        expect(prompt).toContain("text: (no body text)");
    });
});
describe("enrichDocuments", () => {
    it("skips the LLM when there are no documents", async () => {
        mockedRunBurst.mockReset();
        const result = await enrichDocuments({
            model: {} as never,
            documents: [],
            sampleByDocument: new Map(),
            vocabulary: ITALIAN_PROCUREMENT_VOCABULARY,
        });
        expect(result.documents).toHaveLength(0);
        expect(result.usage.inputTokens).toBe(0);
        expect(mockedRunBurst).not.toHaveBeenCalled();
    });
    it("skips the LLM when the corpus has no discovered topics", async () => {
        mockedRunBurst.mockReset();
        const documents = [documentEntry("doc_a", "Affidamento lavori")];
        const result = await enrichDocuments({
            model: {} as never,
            documents,
            sampleByDocument: new Map(),
            vocabulary: EMPTY_DOMAIN_VOCABULARY,
        });
        expect(result.documents).toEqual(documents);
        expect(mockedRunBurst).not.toHaveBeenCalled();
    });
    it("builds the label space and prompt from the vocabulary", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: { documents: [] },
            usage: { inputTokens: 1, outputTokens: 1, costUsd: null },
        } as never);
        await enrichDocuments({
            model: {} as never,
            documents: [documentEntry("doc_a", "Affidamento lavori")],
            sampleByDocument: new Map([["doc_a", "Oggetto: appalto"]]),
            vocabulary: ITALIAN_PROCUREMENT_VOCABULARY,
        });
        const request = mockedRunBurst.mock.calls[0]?.[0];
        expect(request?.system).toContain("pnrr");
        expect(request?.system).toContain(ITALIAN_PROCUREMENT_VOCABULARY.corpusSummary);
        expect(() => request?.schema.parse({ documents: [{ documentId: "doc_a", topics: ["hotel"], summary: "" }] })).toThrow();
    });
    it("applies topics and summary onto the matching catalog entries", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: {
                documents: [
                    { documentId: "doc_a", topics: ["pnrr", "appalto"], summary: "Affida i lavori." },
                ],
            },
            usage: { inputTokens: 120, outputTokens: 40, costUsd: 0.001 },
        } as never);
        const result = await enrichDocuments({
            model: {} as never,
            documents: [documentEntry("doc_a", "Affidamento lavori"), documentEntry("doc_b", "Avviso")],
            sampleByDocument: new Map([["doc_a", "Oggetto: affidamento lavori PNRR"]]),
            vocabulary: ITALIAN_PROCUREMENT_VOCABULARY,
        });
        const [first, second] = result.documents;
        expect(first?.topics).toEqual(["pnrr", "appalto"]);
        expect(first?.summary).toBe("Affida i lavori.");
        expect(second?.topics).toBeUndefined();
        expect(result.usage.inputTokens).toBe(120);
    });
    it("splits large corpora into batches and sums usage", async () => {
        mockedRunBurst.mockReset();
        mockedRunBurst.mockResolvedValue({
            output: { documents: [] },
            usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.002 },
        } as never);
        const documents = Array.from({ length: DOCUMENT_ENRICHMENT_BATCH_SIZE + 1 }, (_, index) => documentEntry(`doc_${String(index)}`, "Oggetto"));
        const result = await enrichDocuments({
            model: {} as never,
            documents,
            sampleByDocument: new Map(),
            vocabulary: ITALIAN_PROCUREMENT_VOCABULARY,
        });
        expect(mockedRunBurst).toHaveBeenCalledTimes(2);
        expect(result.usage.inputTokens).toBe(200);
        expect(result.usage.costUsd).toBeCloseTo(0.004);
    });
});
