import { describe, expect, it } from "vitest";
import { ensureCurrencyFactTypes } from "../../src/ensure-currency-facts.js";
import { extractMentionsFromLines } from "../../src/extract-document-mentions.js";
import { extractFactsFromLines } from "../../src/extract-facts.js";
import { ITALIAN_PA_DETERMINATION_LINES } from "../fixtures/italian-pa-document.js";
import { PROCUREMENT_VOCABULARY } from "../fixtures/vocabulary.js";
function extractFactsLikeModelCommand(lineRows: typeof ITALIAN_PA_DETERMINATION_LINES, vocabulary: typeof PROCUREMENT_VOCABULARY) {
    const enrichedVocabulary = ensureCurrencyFactTypes(vocabulary, lineRows);
    const rawMentions = extractMentionsFromLines(lineRows, enrichedVocabulary);
    const facts = extractFactsFromLines(lineRows, rawMentions, enrichedVocabulary);
    return { facts, vocabulary: enrichedVocabulary, rawMentions };
}
describe("model CLI fact pipeline", () => {
    it("extracts seven facts from the Italian PA fixture through the model path", () => {
        const { facts } = extractFactsLikeModelCommand(ITALIAN_PA_DETERMINATION_LINES, PROCUREMENT_VOCABULARY);
        expect(facts).toHaveLength(7);
    });
    it("still extracts currency when domain discovery omits currency fact types", () => {
        const vocabularyWithoutCurrency = {
            ...PROCUREMENT_VOCABULARY,
            factTypes: PROCUREMENT_VOCABULARY.factTypes.filter((factType) => factType.quantity !== "currency"),
        };
        const { facts, vocabulary } = extractFactsLikeModelCommand(ITALIAN_PA_DETERMINATION_LINES, vocabularyWithoutCurrency);
        expect(vocabulary.factTypes.some((factType) => factType.quantity === "currency")).toBe(true);
        expect(facts.length).toBeGreaterThanOrEqual(6);
        expect(facts.every((fact) => fact.amount !== null)).toBe(true);
    });
});
