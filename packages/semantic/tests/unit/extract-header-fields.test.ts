import { describe, expect, it } from "vitest";
import { extractHeaderFields, findRecurringLines, isOcrNoiseLine, normalizeLine, } from "../../src/extract-header-fields.js";
import type { HeaderFieldContext } from "../../src/extract-header-fields.js";
import { ENGLISH_INVOICE_VOCABULARY, ITALIAN_PROCUREMENT_VOCABULARY, } from "../fixtures/vocabulary.js";
const LETTERHEAD = "Comune di Gerace - Ufficio Tecnico";
function italianContext(recurring: string[] = []): HeaderFieldContext {
    return {
        vocabulary: ITALIAN_PROCUREMENT_VOCABULARY,
        recurringLines: new Set(recurring.map(normalizeLine)),
    };
}
describe("isOcrNoiseLine", () => {
    it("rejects dash-only OCR separator lines", () => {
        expect(isOcrNoiseLine("--------------------")).toBe(true);
        expect(isOcrNoiseLine("| | | | |")).toBe(true);
    });
    it("rejects low-alphanumeric-ratio OCR garbage", () => {
        expect(isOcrNoiseLine("l . l . l . l . l .")).toBe(true);
    });
    it("rejects all-caps banner lines", () => {
        expect(isOcrNoiseLine("COMUNE DI GERACE")).toBe(true);
        expect(isOcrNoiseLine("ACME BUILDING INC")).toBe(true);
    });
    it("accepts meaningful subject lines", () => {
        expect(isOcrNoiseLine("Avviso di avvio del procedimento SUAP")).toBe(false);
        expect(isOcrNoiseLine("Invoice for scaffolding rental")).toBe(false);
    });
});
describe("normalizeLine", () => {
    it("collapses case, whitespace, and digit runs so paginated variants compare equal", () => {
        expect(normalizeLine("  Pag. 1  di 4 ")).toBe("pag. # di #");
        expect(normalizeLine("Pag. 2 di 9")).toBe("pag. # di #");
    });
});
describe("findRecurringLines", () => {
    it("keeps the lines shared by a large share of the samples", () => {
        const recurring = findRecurringLines([
            [LETTERHEAD, "Oggetto: appalto strada"],
            [LETTERHEAD, "Oggetto: tributi IMU"],
            [LETTERHEAD, "Oggetto: avviso elettorale"],
            [LETTERHEAD, "Oggetto: bando cultura"],
        ]);
        expect(recurring.has(normalizeLine(LETTERHEAD))).toBe(true);
        expect(recurring.has(normalizeLine("Oggetto: appalto strada"))).toBe(false);
    });
    it("stays empty below the minimum sample count", () => {
        expect(findRecurringLines([[LETTERHEAD], [LETTERHEAD]]).size).toBe(0);
    });
});
describe("extractHeaderFields", () => {
    it("skips OCR noise and recurring lines when picking the subject", () => {
        const fields = extractHeaderFields("documento_avviso_suap", [
            LETTERHEAD,
            "--------------------",
            "l . l . l . l . l .",
            "Avviso di avvio del procedimento SUAP per autorizzazione commerciale",
        ], italianContext([LETTERHEAD]));
        expect(fields.subject).toBe("Avviso di avvio del procedimento SUAP per autorizzazione commerciale");
    });
    it("treats the line recurring across the corpus as the issuing office", () => {
        const fields = extractHeaderFields("documento_avviso_suap", [LETTERHEAD, "Avviso di avvio del procedimento SUAP"], italianContext([LETTERHEAD]));
        expect(fields.issuingOffice).toBe(LETTERHEAD);
    });
    it("leaves the issuing office unset when no header line recurs", () => {
        const fields = extractHeaderFields("documento_avviso_suap", [LETTERHEAD, "Avviso di avvio del procedimento SUAP"], italianContext());
        expect(fields.issuingOffice).toBeNull();
        expect(fields.subject).toBe(LETTERHEAD);
    });
    it("falls back to slug-derived protocol and date", () => {
        const fields = extractHeaderFields("prot_par_0010783_del_31_08_2026_documento_delibera_g_c_n", [], italianContext());
        expect(fields.protocolNumber).toBe("0010783");
        expect(fields.publishedDate).toBe("2026-08-31");
    });
    it("reads the registry number after one of the vocabulary's identifier cues", () => {
        const italian = extractHeaderFields("determinazioni_set_amm_2026_gen_741", ["Determina di affidamento CIG 1234567890"], italianContext());
        const english = extractHeaderFields("vendor_invoice_march", ["Invoice against PO 4451"], { vocabulary: ENGLISH_INVOICE_VOCABULARY, recurringLines: new Set() });
        expect(italian.protocolNumber).toBe("1234567890");
        expect(english.protocolNumber).toBe("4451");
    });
    it("orders ambiguous date components by the corpus's convention", () => {
        const headerLines = ["Data 05/03/2026"];
        expect(extractHeaderFields("doc", headerLines, italianContext()).publishedDate).toBe("2026-03-05");
        expect(extractHeaderFields("doc", headerLines, {
            vocabulary: ENGLISH_INVOICE_VOCABULARY,
            recurringLines: new Set(),
        }).publishedDate).toBe("2026-05-03");
    });
    it("returns empty fields without a vocabulary or recurring lines", () => {
        expect(extractHeaderFields("aspc982920", ["Header"])).toEqual({
            protocolNumber: null,
            publishedDate: null,
            subject: null,
            issuingOffice: null,
        });
    });
});
