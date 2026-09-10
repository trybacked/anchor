import { describe, expect, it } from "vitest";
import { buildFallbackDomainVocabulary } from "../../src/discover-domain.js";

describe("buildFallbackDomainVocabulary", () => {
    it("returns minimal vocabulary with scanned name suffixes when LLM discovery fails", () => {
        const vocabulary = buildFallbackDomainVocabulary([
            { document_id: "doc_a", page: 1, line: 1, text: "Impresa Edile Rossi S.r.l." },
            { document_id: "doc_b", page: 1, line: 2, text: "Studio Tecnico Bianchi S.p.A." },
        ]);
        expect(vocabulary.documentTopics).toEqual([]);
        expect(vocabulary.factTypes).toEqual([]);
        expect(vocabulary.identifierFormats).toEqual([]);
        expect(vocabulary.entityLabel).toBe("entity");
        expect(vocabulary.nameConventions.leadingNoise).toEqual([]);
    });
});
