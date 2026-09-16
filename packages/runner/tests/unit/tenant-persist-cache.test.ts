import { describe, expect, it } from "vitest";
import { documentTypeTableName } from "@backed/core";
import type { DocumentCatalog } from "@backed/core";
import { mergeDocumentCatalogs, resolveCatalogForInference } from "../../src/tenant-persist-cache.js";

function catalogDocument(
    sourceTable: string,
    sourceFile: string,
    documentType: string,
): DocumentCatalog["documents"][number] {
    return {
        sourceTable,
        sourceFile,
        documentType,
        documentTypeLabel: documentType,
        confidence: 0.9,
        pageCount: 1,
    };
}

describe("resolveCatalogForInference", () => {
    it("returns the persisted catalog when the run produced no document stage", () => {
        const persisted: DocumentCatalog = {
            runId: "run-1",
            generatedAt: "2026-01-01T00:00:00.000Z",
            documents: [catalogDocument("doc_a", "a.pdf", "publication")],
            documentTypes: [],
        };
        expect(resolveCatalogForInference(undefined, persisted)).toBe(persisted);
    });

    it("merges persisted and run catalogs for incremental inference", () => {
        const persisted: DocumentCatalog = {
            runId: "run-1",
            generatedAt: "2026-01-01T00:00:00.000Z",
            documents: [catalogDocument("doc_a", "a.pdf", "publication")],
            documentTypes: [],
        };
        const incoming: DocumentCatalog = {
            runId: "run-2",
            generatedAt: "2026-01-02T00:00:00.000Z",
            documents: [catalogDocument("doc_b", "b.pdf", "notice")],
            documentTypes: [],
        };
        const merged = resolveCatalogForInference(incoming, persisted);
        expect(merged?.documents.map((document) => document.sourceTable).sort()).toEqual(["doc_a", "doc_b"]);
    });
});

describe("mergeDocumentCatalogs", () => {
    it("merges documents by sourceTable and rebuilds document types", () => {
        const existing: DocumentCatalog = {
            runId: "run-1",
            generatedAt: "2026-01-01T00:00:00.000Z",
            documents: [
                catalogDocument("doc_a", "a.pdf", "publication"),
                catalogDocument("doc_b", "b.pdf", "publication"),
            ],
            documentTypes: [{
                id: "publication",
                name: "publication",
                tableName: documentTypeTableName("publication"),
                documentCount: 2,
                confidence: 0.9,
                sampleSourceTables: ["doc_a", "doc_b"],
            }],
        };
        const incoming: DocumentCatalog = {
            runId: "run-2",
            generatedAt: "2026-01-02T00:00:00.000Z",
            documents: [catalogDocument("doc_c", "c.pdf", "notice")],
            documentTypes: [{
                id: "notice",
                name: "notice",
                tableName: documentTypeTableName("notice"),
                documentCount: 1,
                confidence: 0.9,
                sampleSourceTables: ["doc_c"],
            }],
        };
        const merged = mergeDocumentCatalogs(existing, incoming);
        expect(merged.documents.map((document) => document.sourceTable).sort()).toEqual([
            "doc_a",
            "doc_b",
            "doc_c",
        ]);
        expect(merged.documentTypes.map((type) => type.id).sort()).toEqual(["notice", "publication"]);
        expect(merged.documentTypes.find((type) => type.id === "publication")?.documentCount).toBe(2);
    });

    it("preserves canonical documentType when sourceTable matches", () => {
        const existing: DocumentCatalog = {
            runId: "run-1",
            generatedAt: "2026-01-01T00:00:00.000Z",
            documents: [catalogDocument("doc_a", "a.pdf", "publication")],
            documentTypes: [],
        };
        const incoming: DocumentCatalog = {
            runId: "run-2",
            generatedAt: "2026-01-02T00:00:00.000Z",
            documents: [{
                ...catalogDocument("doc_a", "a.pdf", "published_act"),
                documentTypeLabel: "Published act",
                fields: { title: { value: "Updated subject", confidence: 0.9 } },
            }],
            documentTypes: [],
        };
        const merged = mergeDocumentCatalogs(existing, incoming);
        expect(merged.documents).toHaveLength(1);
        expect(merged.documents[0]?.documentType).toBe("publication");
        expect(merged.documents[0]?.documentTypeLabel).toBe("publication");
        expect(merged.documents[0]?.fields.title?.value).toBe("Updated subject");
    });
});
