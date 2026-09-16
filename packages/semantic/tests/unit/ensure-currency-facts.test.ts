import { describe, expect, it } from "vitest";
import { ensureCurrencyFactTypes } from "../../src/ensure-currency-facts.js";
import { PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";
describe("ensureCurrencyFactTypes", () => {
    it("adds currency fact type when corpus has amounts but vocabulary lacks one", () => {
        const vocabulary = ensureCurrencyFactTypes({
            ...PROCUREMENT_VOCABULARY,
            factTypes: PROCUREMENT_VOCABULARY.factTypes.filter((factType) => factType.quantity !== "currency"),
        }, [
            { document_id: "doc_a", page: 1, line: 1, text: "Importo contrattuale € 50.000,00" },
            { document_id: "doc_b", page: 1, line: 2, text: "Oneri di sicurezza € 1.200,00" },
        ]);
        expect(vocabulary.factTypes.some((factType) => factType.quantity === "currency")).toBe(true);
    });
    it("detects Italian liquidazione and impegno cues in corpus samples", () => {
        const vocabulary = ensureCurrencyFactTypes({
            ...PROCUREMENT_VOCABULARY,
            factTypes: PROCUREMENT_VOCABULARY.factTypes.filter((factType) => factType.quantity !== "currency"),
        }, [
            { document_id: "doc_a", page: 1, line: 1, text: "Liquidazione fattura per Euro 45.678,90" },
            { document_id: "doc_b", page: 1, line: 2, text: "Impegno di spesa per lavori per €39.315,88" },
        ]);
        expect(vocabulary.factTypes.some((factType) => factType.quantity === "currency")).toBe(true);
    });
});
