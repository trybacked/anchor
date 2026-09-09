import { describe, expect, it } from "vitest";
import { hashDocumentSample } from "../../src/document-sample-fingerprint.js";
import type { DocumentExtractionSample } from "../../src/extract-document-catalog.js";

describe("hashDocumentSample", () => {
    it("changes when header lines change", () => {
        const base: DocumentExtractionSample = {
            sourceTable: "doc_a",
            headerLines: ["Header A"],
            pageCount: 1,
        };
        const changed: DocumentExtractionSample = {
            ...base,
            headerLines: ["Header B"],
        };
        expect(hashDocumentSample(base)).not.toBe(hashDocumentSample(changed));
    });
    it("is stable for the same sample", () => {
        const sample: DocumentExtractionSample = {
            sourceTable: "doc_a",
            headerLines: ["Header A"],
            pageCount: 1,
        };
        expect(hashDocumentSample(sample)).toBe(hashDocumentSample(sample));
    });
});
