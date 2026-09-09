import type { SemanticModel } from "@backed/core";
import { describe, expect, it } from "vitest";
import { searchModelViaDocumentChunks } from "../../src/model-search.js";

const model: SemanticModel = {
    metadata: {
        formatVersion: "1",
        runId: "test-run",
        generatedAt: "2026-01-01T00:00:00.000Z",
    },
    entities: [
        {
            id: "determina",
            name: "Determina",
            sourceTable: "doc_determina",
            status: "confirmed",
            confidence: 0.9,
            provenance: { table: "doc_determina", evidence: "fixture" },
            properties: [],
        },
        {
            id: "document_chunk",
            name: "Document chunk",
            sourceTable: "doc_chunk",
            status: "confirmed",
            confidence: 0.9,
            provenance: { table: "doc_chunk", evidence: "fixture" },
            properties: [],
        },
    ],
    relations: [],
    rules: [],
};

describe("searchModelViaDocumentChunks", () => {
    it("maps chunk document_id to typed document entity via catalog", async () => {
        const hits = await searchModelViaDocumentChunks(model, async () => [{
            document_id: "doc_determina",
            text: "Determina n. 251 del Comune di Gerace",
        }], "affidamento lavori", {
            documentTypes: [],
            documents: [{
                sourceTable: "doc_determina",
                documentType: "determina",
                documentTypeLabel: "Determina",
                sourceFile: "determina.pdf",
                protocolNumber: null,
                publishedDate: null,
                subject: null,
                issuingOffice: null,
                topics: [],
            }],
        });
        expect(hits).toEqual([expect.objectContaining({
            kind: "entity",
            id: "determina",
            name: "Determina",
        })]);
    });
});
