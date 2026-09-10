import { describe, expect, it } from "vitest";
import { buildEntityIndex, entityIdFromName, extractMentionsFromLines, toMaterializedMentions, } from "../../src/extract-document-mentions.js";
import { ITALIAN_PA_DETERMINATION_LINES } from "../fixtures/italian-pa-document.js";
import { ITALIAN_PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";
describe("mention attribution with EDIL VINCENT fixture", () => {
    it("attributes CIG to EDIL VINCENT SRL from the Italian PA determination lines", () => {
        const mentions = extractMentionsFromLines([
            {
                document_id: "det_2024_042",
                page: 1,
                line: 8,
                text: "Affidamento lavori alla ditta EDIL VINCENT SRL, CIG Z123456789",
            },
        ], ITALIAN_PROCUREMENT_VOCABULARY);
        const materialized = toMaterializedMentions(mentions, buildEntityIndex(mentions));
        const edilId = entityIdFromName("EDIL VINCENT SRL");
        const edilCig = materialized.find((row) => row.mentionType === "cig" && row.normalizedValue === "Z123456789");
        expect(edilCig?.entityId).toBe(edilId);
    });
    it("attributes PIVA only when the extracted context names EDIL VINCENT SRL", () => {
        const mentions = extractMentionsFromLines([
            {
                document_id: "doc_a",
                page: 1,
                line: 3,
                text: "Affidamento a EDIL VINCENT SRL P.IVA 11111111111",
            },
            {
                document_id: "doc_a",
                page: 1,
                line: 8,
                text: "Servizi Morpheme S.r.l. P.IVA 22222222222",
            },
        ], ITALIAN_PROCUREMENT_VOCABULARY);
        const materialized = toMaterializedMentions(mentions, buildEntityIndex(mentions));
        const edilId = entityIdFromName("EDIL VINCENT SRL");
        const byValue = new Map(materialized
            .filter((row) => row.mentionType === "piva")
            .map((row) => [row.normalizedValue, row.entityId]));
        expect(byValue.get("11111111111")).toBe(edilId);
        expect(byValue.get("22222222222")).not.toBe(edilId);
    });
    it("attributes identifiers from the full EDIL VINCENT determination fixture", () => {
        const mentions = extractMentionsFromLines(ITALIAN_PA_DETERMINATION_LINES, ITALIAN_PROCUREMENT_VOCABULARY);
        const materialized = toMaterializedMentions(mentions, buildEntityIndex(mentions));
        const edilId = entityIdFromName("EDIL VINCENT SRL");
        const edilEntity = materialized.find((row) => row.mentionType === "entity" && row.entityId === edilId);
        expect(edilEntity?.normalizedValue).toBe("EDIL VINCENT SRL");
    });
});
