import { ENTITY_MENTION_TYPE } from "@backed/core";
import { describe, expect, it } from "vitest";
import { buildEntityIndex, entityIdFromName, extractMentionsFromLine, extractMentionsFromLines, toMaterializedMentions, } from "../../src/extract-document-mentions.js";
import { ENGLISH_INVOICE_VOCABULARY, ITALIAN_PROCUREMENT_VOCABULARY, } from "../fixtures/vocabulary.js";
function line(text: string, page = 1, lineNumber = 1) {
    return { document_id: "doc_1", page, line: lineNumber, text };
}
describe("extractMentionsFromLine", () => {
    it("extracts a proper name ending in one of the corpus's suffixes", () => {
        const mentions = extractMentionsFromLine(line("Affidamento lavori alla società EDIL VINCENT SRL per importo di € 50.000"), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(1);
        expect(mentions[0]?.mentionType).toBe(ENTITY_MENTION_TYPE);
        expect(mentions[0]?.text).toBe("EDIL VINCENT SRL");
        expect(mentions[0]?.normalizedValue).toBe("EDIL VINCENT SRL");
    });
    it("matches suffixes printed with dots between the letters", () => {
        const mentions = extractMentionsFromLine(line("Impresa COSTRUZIONI ROSSI S.R.L. aggiudicataria"), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(1);
        expect(mentions[0]?.normalizedValue).toBe("COSTRUZIONI ROSSI S.R.L.");
    });
    it("strips the leading noise words declared by the vocabulary", () => {
        const mentions = extractMentionsFromLine(line("Ditta ALFA COSTRUZIONI SRL incaricata dei lavori"), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions[0]?.text).toBe("ALFA COSTRUZIONI SRL");
    });
    it("extracts a coded identifier under its format id", () => {
        const mentions = extractMentionsFromLine(line("CIG: Z123456789 assegnato al contratto", 3, 5), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(1);
        expect(mentions[0]?.mentionType).toBe("cig");
        expect(mentions[0]?.normalizedValue).toBe("Z123456789");
        expect(mentions[0]?.text).toBe("CIG: Z123456789");
    });
    it("ignores identifiers whose length falls outside the declared range", () => {
        const mentions = extractMentionsFromLine(line("CIG: Z12 non valido"), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(0);
    });
    it("returns nothing for text carrying neither a name nor an identifier", () => {
        expect(extractMentionsFromLine(line("Determina di approvazione del progetto edilizio"), ITALIAN_PROCUREMENT_VOCABULARY)).toHaveLength(0);
    });
    it("deduplicates a name repeated within one line", () => {
        const mentions = extractMentionsFromLine(line("EDIL VINCENT SRL e, per essa, EDIL VINCENT SRL quale mandataria"), ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions).toHaveLength(1);
    });
});
describe("extractMentionsFromLine across vocabularies", () => {
    it("finds English names and PO numbers with the same engine", () => {
        const mentions = extractMentionsFromLine(line("Invoice issued by ACME Building Inc under PO 4451"), ENGLISH_INVOICE_VOCABULARY);
        expect(mentions.map((mention) => [mention.mentionType, mention.normalizedValue])).toEqual([
            [ENTITY_MENTION_TYPE, "ACME BUILDING INC"],
            ["po", "4451"],
        ]);
    });
    it("does not recognize a corpus's conventions under the other vocabulary", () => {
        const englishLine = line("Invoice issued by ACME Building Inc under PO 4451");
        const italianLine = line("Affidamento a EDIL VINCENT SRL, CIG Z123456789");
        expect(extractMentionsFromLine(englishLine, ITALIAN_PROCUREMENT_VOCABULARY)).toHaveLength(0);
        expect(extractMentionsFromLine(italianLine, ENGLISH_INVOICE_VOCABULARY)).toHaveLength(0);
    });
});
describe("extractMentionsFromLines", () => {
    it("keeps one mention per occurrence across lines", () => {
        const mentions = extractMentionsFromLines([
            { document_id: "doc_1", page: 1, line: 1, text: "EDIL VINCENT SRL partecipa al bando" },
            {
                document_id: "doc_1",
                page: 2,
                line: 4,
                text: "Si conferma EDIL VINCENT SRL quale aggiudicataria",
            },
        ], ITALIAN_PROCUREMENT_VOCABULARY);
        const entities = mentions.filter((mention) => mention.mentionType === ENTITY_MENTION_TYPE);
        expect(entities).toHaveLength(2);
        expect(entities.every((mention) => mention.normalizedValue === "EDIL VINCENT SRL")).toBe(true);
    });
});
describe("buildEntityIndex", () => {
    it("aggregates mention and document counts per entity", () => {
        const mentions = extractMentionsFromLines([
            { document_id: "doc_a", page: 1, line: 1, text: "EDIL VINCENT SRL" },
            { document_id: "doc_b", page: 1, line: 2, text: "EDIL VINCENT SRL" },
        ], ITALIAN_PROCUREMENT_VOCABULARY);
        const entity = buildEntityIndex(mentions).get(entityIdFromName("EDIL VINCENT SRL"));
        expect(entity?.entityId).toBe("edil_vincent_srl");
        expect(entity?.mentionCount).toBe(2);
        expect(entity?.documentCount).toBe(2);
    });
    it("indexes entities from any vocabulary", () => {
        const mentions = extractMentionsFromLines([{ document_id: "doc_a", page: 1, line: 1, text: "ACME Building Inc" }], ENGLISH_INVOICE_VOCABULARY);
        expect([...buildEntityIndex(mentions).keys()]).toEqual(["acme_building_inc"]);
    });
});
describe("toMaterializedMentions", () => {
    it("links name mentions to their entity id and attributes identifiers named in context", () => {
        const mentions = extractMentionsFromLines([{ document_id: "doc_1", page: 1, line: 1, text: "EDIL VINCENT SRL, CIG Z123456789" }], ITALIAN_PROCUREMENT_VOCABULARY);
        const materialized = toMaterializedMentions(mentions, buildEntityIndex(mentions));
        const byType = new Map(materialized.map((row) => [row.mentionType, row]));
        expect(byType.get(ENTITY_MENTION_TYPE)?.entityId).toBe(entityIdFromName("EDIL VINCENT SRL"));
        expect(byType.get("cig")?.entityId).toBe(entityIdFromName("EDIL VINCENT SRL"));
        expect(byType.get(ENTITY_MENTION_TYPE)?.mentionId).toContain("doc_1");
    });
    it("does not attribute identifiers to EDIL VINCENT when the context names another party", () => {
        const mentions = extractMentionsFromLines([
            {
                document_id: "doc_a",
                page: 1,
                line: 8,
                text: "Servizi Morpheme S.r.l. P.IVA 22222222222",
            },
        ], ITALIAN_PROCUREMENT_VOCABULARY);
        const materialized = toMaterializedMentions(mentions, buildEntityIndex(mentions));
        const piva = materialized.find((row) => row.mentionType === "piva");
        expect(piva?.entityId).not.toBe(entityIdFromName("EDIL VINCENT SRL"));
    });
});
