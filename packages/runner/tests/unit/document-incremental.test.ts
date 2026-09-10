import { describe, expect, it } from "vitest";
import type { DocumentCatalog } from "@backed/core";
import {
    resolveNewDocumentSourceTables,
} from "../../src/pipeline/document-incremental.js";

describe("resolveNewDocumentSourceTables", () => {
    it("returns only documents from unknown source files when provided", () => {
        const documents: DocumentCatalog["documents"] = [
            {
                sourceTable: "doc_a",
                sourceFile: "known.pdf",
                documentType: "publication",
                documentTypeLabel: "Publication",
                confidence: 0.9,
                pageCount: 1,
            },
            {
                sourceTable: "doc_b",
                sourceFile: "new.pdf",
                documentType: "notice",
                documentTypeLabel: "Notice",
                confidence: 0.9,
                pageCount: 1,
            },
        ];
        const affected = resolveNewDocumentSourceTables(documents, ["new.pdf"], undefined);
        expect(affected).toEqual(new Set(["doc_b"]));
    });
});
