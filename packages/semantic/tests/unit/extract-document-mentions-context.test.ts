import { describe, expect, it } from "vitest";
import { buildLineContextMap, extractMentionsFromLine, extractMentionsFromLines, } from "../../src/extract-document-mentions.js";
import { ITALIAN_PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";
describe("mention context", () => {
    it("captures surrounding lines in mention context", () => {
        const rows = [
            { document_id: "doc_1", page: 1, line: 8, text: "Riga precedente di contesto" },
            {
                document_id: "doc_1",
                page: 1,
                line: 9,
                text: "Affidamento lavori alla società EDIL VINCENT SRL",
            },
            { document_id: "doc_1", page: 1, line: 10, text: "per importo di € 50.000" },
        ];
        const mentions = extractMentionsFromLines(rows, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(1);
        expect(mentions[0]?.context).toContain("EDIL VINCENT SRL");
        expect(mentions[0]?.context).toContain("Riga precedente");
        expect(mentions[0]?.context).toContain("€ 50.000");
        expect(mentions[0]?.context.length).toBeLessThanOrEqual(400);
    });
    it("buildLineContextMap respects radius and max chars", () => {
        const rows = Array.from({ length: 8 }, (_, index) => ({
            document_id: "doc_1",
            page: 1,
            line: index + 1,
            text: `Linea ${String(index + 1)} ${"x".repeat(80)}`,
        }));
        const contextMap = buildLineContextMap(rows, 2, 120);
        const context = contextMap.get("doc_1:1:4");
        expect(context).toBeDefined();
        expect(context?.length).toBeLessThanOrEqual(120);
    });
    it("falls back to the current line when no context is passed", () => {
        const mentions = extractMentionsFromLine({ document_id: "doc_1", page: 1, line: 1, text: "EDIL VINCENT SRL aggiudicataria" }, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions[0]?.context).toBe("EDIL VINCENT SRL aggiudicataria");
    });
    it("uses the context passed explicitly by the caller", () => {
        const mentions = extractMentionsFromLine({ document_id: "doc_1", page: 1, line: 1, text: "EDIL VINCENT SRL aggiudicataria" }, ITALIAN_PROCUREMENT_VOCABULARY, "contesto esplicito");
        expect(mentions[0]?.context).toBe("contesto esplicito");
    });
});
