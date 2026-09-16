import { describe, expect, it } from "vitest";
import { scanNameSuffixes, filterPlausibleSuffixes } from "../../src/scan-name-suffixes.js";
function line(documentId: string, text: string) {
    return { document_id: documentId, page: 1, line: 1, text };
}
describe("scanNameSuffixes", () => {
    it("collects single-word company names before a legal-form suffix", () => {
        const suffixes = scanNameSuffixes([
            line("doc_a", "Affidamento a PROMOCOST SRL per importo di € 50.000"),
            line("doc_b", "Impresa ROSSI SRL aggiudicataria del CIG Z1234567890"),
        ]);
        expect(suffixes).toContain("srl");
    });
    it("collects legal-form suffixes seen across multiple documents", () => {
        const suffixes = scanNameSuffixes([
            line("doc_a", "Affidamento a EDIL VINCENT SRL per importo di € 50.000"),
            line("doc_b", "Impresa COSTRUZIONI ROSSI S.R.L. aggiudicataria del CIG Z1234567890"),
            line("doc_c", "Ditta PROMOCOST S.R.L. mandante del RTI, importo € 1.000"),
        ]);
        expect(suffixes).toContain("srl");
    });
    it("ignores function-word false positives from ordinary prose", () => {
        const suffixes = scanNameSuffixes([
            line("doc_a", "Elezione del Comune di Gerace nel 2026"),
            line("doc_b", "Scrutatori per la sezione nel Comune"),
            line("doc_c", "Il Comune DEL Registro"),
        ]);
        expect(suffixes).not.toContain("del");
        expect(suffixes).not.toContain("nel");
    });
    it("filters junk suffixes out of merged vocabulary lists", () => {
        expect(filterPlausibleSuffixes(["srl", "the", "and", "spa"])).toEqual(["srl", "spa"]);
    });
});
