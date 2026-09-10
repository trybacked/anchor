import { describe, expect, it } from "vitest";
import { extractVocabularyFields, filterHeaderLinesForLlm, findRecurringLines, isOcrNoiseLine, normalizeLine, } from "../../src/extract-header-fields.js";
import { ENGLISH_INVOICE_VOCABULARY, PROCUREMENT_VOCABULARY, } from "../fixtures/vocabulary.js";

const LETTERHEAD = "Comune di Gerace - Ufficio Tecnico";

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

describe("filterHeaderLinesForLlm", () => {
    it("drops recurring boilerplate before the LLM prompt", () => {
        const recurring = findRecurringLines([
            [LETTERHEAD, "Oggetto: appalto strada"],
            [LETTERHEAD, "Oggetto: tributi IMU"],
            [LETTERHEAD, "Oggetto: avviso elettorale"],
            [LETTERHEAD, "Oggetto: bando cultura"],
        ]);
        expect(filterHeaderLinesForLlm([LETTERHEAD, "Oggetto: appalto strada"], recurring)).toEqual([
            "Oggetto: appalto strada",
        ]);
    });
});

describe("extractVocabularyFields", () => {
    it("reads identifier values using vocabulary cues", () => {
        const procurement = extractVocabularyFields(["Award notice CIG 1234567890"], PROCUREMENT_VOCABULARY);
        const english = extractVocabularyFields(["Invoice against PO 4451"], ENGLISH_INVOICE_VOCABULARY);
        expect(procurement.cig).toBe("1234567890");
        expect(english.po).toBe("4451");
    });
    it("returns no fields without configured identifier formats", () => {
        expect(extractVocabularyFields(["Header line"])).toEqual({});
    });
});
