import { ENTITY_MENTION_TYPE } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
import { describe, expect, it } from "vitest";
import { extractMentionsFromLines } from "../../src/extract-document-mentions.js";
import { extractFactsFromLine, extractFactsFromLines } from "../../src/extract-facts.js";
import type { RawFact } from "../../src/extract-facts.js";
import { ITALIAN_PA_DETERMINATION_LINES } from "../fixtures/italian-pa-document.js";
import { ENGLISH_INVOICE_VOCABULARY, ITALIAN_PROCUREMENT_VOCABULARY, } from "../fixtures/vocabulary.js";
function line(text: string, page = 1, lineNumber = 1) {
    return { document_id: "doc_1", page, line: lineNumber, text };
}
function amountsByType(facts: RawFact[]): Map<string, number | null> {
    return new Map(facts.map((fact) => [fact.factType, fact.amount]));
}
function factsFor(text: string, vocabulary: DomainVocabulary, subjectLine: string): RawFact[] {
    const rows = [line(subjectLine, 2, 10), line(text, 2, 12)];
    const mentions = extractMentionsFromLines(rows, vocabulary);
    return extractFactsFromLine(rows[1] as (typeof rows)[number], mentions, vocabulary);
}
describe("extractFactsFromLine", () => {
    it("labels each quantity with the nearest preceding cue", () => {
        const facts = factsFor("Importo contrattuale € 3.899.802,03 con ribasso del 30,505% e oneri per la sicurezza € 167.920,53", ITALIAN_PROCUREMENT_VOCABULARY, "Affidamento a EDIL VINCENT SRL, CIG Z123456789");
        expect(amountsByType(facts)).toEqual(new Map([
            ["importo_contrattuale", 3899802.03],
            ["oneri_sicurezza", 167920.53],
            ["ribasso_pct", 30.505],
        ]));
    });
    it("attaches the nearest entity and coded identifier on the page", () => {
        const facts = factsFor("Importo contrattuale € 3.899.802,03", ITALIAN_PROCUREMENT_VOCABULARY, "Affidamento a EDIL VINCENT SRL, CIG Z123456789");
        expect(facts[0]).toMatchObject({
            entityId: "edil_vincent_srl",
            identifierType: "cig",
            identifierValue: "Z123456789",
            documentId: "doc_1",
            page: 2,
            line: 12,
        });
    });
    it("gives the default fact type to a quantity that matches no cue", () => {
        const facts = extractFactsFromLine(line("Totale complessivo € 1.000,00"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts.map((fact) => fact.factType)).toEqual(["importo_contrattuale"]);
        expect(facts[0]?.entityId).toBeNull();
    });
    it("drops an uncued quantity whose kind has no default type", () => {
        const facts = extractFactsFromLine(line("Aliquota IVA 22%"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(0);
    });
    it("extracts nothing when the vocabulary declares no fact types", () => {
        const emptyFactTypes: DomainVocabulary = {
            ...ITALIAN_PROCUREMENT_VOCABULARY,
            factTypes: [],
        };
        expect(extractFactsFromLine(line("Importo € 1.000,00"), [], emptyFactTypes)).toHaveLength(0);
    });
});
describe("extractFactsFromLine across vocabularies", () => {
    it("reads the same shapes from an unrelated corpus and locale", () => {
        const facts = factsFor("Invoice total $1,250.00 after a discount of 12.5%, shipping $75.00", ENGLISH_INVOICE_VOCABULARY, "Issued by ACME Building Inc under PO 4451");
        expect(amountsByType(facts)).toEqual(new Map([
            ["invoice_total", 1250],
            ["shipping_fee", 75],
            ["discount_rate", 12.5],
        ]));
        expect(facts[0]).toMatchObject({
            entityId: "acme_building_inc",
            identifierType: "po",
            identifierValue: "4451",
        });
    });
    it("reads thousands separators according to the corpus's number format", () => {
        const italian = extractFactsFromLine(line("Importo € 1.234,56"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        const english = extractFactsFromLine(line("Total $1,234.56"), [], ENGLISH_INVOICE_VOCABULARY);
        expect(italian[0]?.amount).toBe(1234.56);
        expect(english[0]?.amount).toBe(1234.56);
    });
});
describe("extractFactsFromLines", () => {
    it("deduplicates identical quantities restated on the same line number", () => {
        const rows = [
            { document_id: "doc_1", page: 1, line: 1, text: "Importo € 10.000,00" },
            { document_id: "doc_1", page: 1, line: 1, text: "Importo € 10.000,00" },
            { document_id: "doc_1", page: 1, line: 2, text: "Importo € 10.000,00" },
        ];
        const facts = extractFactsFromLines(rows, [], ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(2);
        expect(new Set(facts.map((fact) => fact.factId)).size).toBe(facts.length);
    });
    it("keeps facts attributed to the entity mentioned nearest on the page", () => {
        const rows = [
            { document_id: "doc_1", page: 1, line: 1, text: "EDIL VINCENT SRL aggiudicataria" },
            { document_id: "doc_1", page: 1, line: 2, text: "Importo € 10.000,00" },
            { document_id: "doc_1", page: 2, line: 1, text: "PROMOCOST SRL subappaltatrice" },
            { document_id: "doc_1", page: 2, line: 2, text: "Importo € 4.000,00" },
        ];
        const mentions = extractMentionsFromLines(rows, ITALIAN_PROCUREMENT_VOCABULARY);
        const facts = extractFactsFromLines(rows, mentions, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(mentions.filter((mention) => mention.mentionType === ENTITY_MENTION_TYPE)).toHaveLength(2);
        expect(facts.map((fact) => [fact.entityId, fact.amount])).toEqual([
            ["edil_vincent_srl", 10000],
            ["promocost_srl", 4000],
        ]);
    });
    it("prefers the preceding entity when a later mention is closer by line distance", () => {
        const rows = [
            { document_id: "doc_1", page: 1, line: 5, text: "Affidamento a EDIL VINCENT SRL" },
            { document_id: "doc_1", page: 1, line: 20, text: "Importo € 10.000,00" },
            { document_id: "doc_1", page: 1, line: 22, text: "PROMOCOST SRL subappaltatrice" },
        ];
        const mentions = extractMentionsFromLines(rows, ITALIAN_PROCUREMENT_VOCABULARY);
        const facts = extractFactsFromLines(rows, mentions, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(1);
        expect(facts[0]?.entityId).toBe("edil_vincent_srl");
    });
    it("attributes facts on a new page to the entity on the preceding page", () => {
        const rows = [
            { document_id: "doc_1", page: 1, line: 990, text: "Affidamento a EDIL VINCENT SRL, CIG Z1234567890" },
            { document_id: "doc_1", page: 2, line: 3, text: "Impegno di spesa per lavori per €39.315,88 oltre IVA" },
        ];
        const mentions = extractMentionsFromLines(rows, ITALIAN_PROCUREMENT_VOCABULARY);
        const facts = extractFactsFromLines(rows, mentions, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(1);
        expect(facts[0]?.entityId).toBe("edil_vincent_srl");
        expect(facts[0]?.factType).toBe("impegno_spesa");
        expect(facts[0]?.amount).toBe(39315.88);
    });
});
describe("Italian PA document fixture", () => {
    it("extracts a rich fact set from realistic determination lines", () => {
        const mentions = extractMentionsFromLines(ITALIAN_PA_DETERMINATION_LINES, ITALIAN_PROCUREMENT_VOCABULARY);
        const facts = extractFactsFromLines(ITALIAN_PA_DETERMINATION_LINES, mentions, ITALIAN_PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(7);
        expect(facts.some((fact) => fact.factType === "importo_contrattuale" && fact.amount === 3899802.03)).toBe(true);
        expect(facts.some((fact) => fact.factType === "oneri_sicurezza" && fact.amount === 167920.53)).toBe(true);
        expect(facts.some((fact) => fact.factType === "ribasso_pct" && fact.amount === 30.505)).toBe(true);
        expect(facts.some((fact) => fact.factType === "impegno_spesa" && fact.amount === 39315.88)).toBe(true);
        expect(facts.some((fact) => fact.factType === "liquidazione" && fact.amount === 45678.9)).toBe(true);
        expect(facts.some((fact) => fact.factType === "liquidazione" && fact.amount === 8000)).toBe(true);
        expect(facts.some((fact) => fact.rawText === "12.500,00 euro" && fact.amount === 12500)).toBe(true);
        const attributed = facts.filter((fact) => fact.entityId !== null);
        expect(attributed.length).toBeGreaterThanOrEqual(5);
        expect(attributed.some((fact) => fact.entityId === "edil_vincent_srl")).toBe(true);
        expect(attributed.some((fact) => fact.entityId === "promocost_srl")).toBe(true);
    });
});
describe("Italian PA currency notation", () => {
    it("reads Euro and euro marks alongside the euro symbol", () => {
        const euroPrefix = extractFactsFromLine(line("Liquidazione fattura per Euro 45.678,90"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        const euroSuffix = extractFactsFromLine(line("Spesa sostenuta pari a 12.500,00 euro"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        const euroTight = extractFactsFromLine(line("Impegno di spesa per lavori per €39.315,88 oltre IVA"), [], ITALIAN_PROCUREMENT_VOCABULARY);
        expect(euroPrefix[0]?.factType).toBe("liquidazione");
        expect(euroPrefix[0]?.amount).toBe(45678.9);
        expect(euroSuffix[0]?.factType).toBe("impegno_spesa");
        expect(euroSuffix[0]?.amount).toBe(12500);
        expect(euroTight[0]?.factType).toBe("impegno_spesa");
        expect(euroTight[0]?.amount).toBe(39315.88);
    });
});
