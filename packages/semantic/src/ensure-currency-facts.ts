import type { DomainVocabulary, FactType } from "@backed/core";
import type { DocumentLineRow } from "./extract-document-mentions.js";
const CURRENCY_MARKERS = /[€$£]|(?:\bEUR\b|\bUSD\b|\b[Ee]ur[oi]\b)/i;
const AMOUNT_CUE_PATTERN = /importo|amount|costo|prezzo|contratt|liquidaz|impegno|spesa|pagament|aggiudic|€|\$/i;
function hasCurrencyFactType(factTypes: FactType[]): boolean {
    return factTypes.some((factType) => factType.quantity === "currency");
}
function corpusHasCurrencyAmounts(lines: DocumentLineRow[]): boolean {
    let hits = 0;
    for (const row of lines) {
        if (CURRENCY_MARKERS.test(row.text) || AMOUNT_CUE_PATTERN.test(row.text)) {
            hits += 1;
            if (hits >= 2) {
                return true;
            }
        }
    }
    return false;
}
export function ensureCurrencyFactTypes(vocabulary: DomainVocabulary, lines: DocumentLineRow[]): DomainVocabulary {
    if (hasCurrencyFactType(vocabulary.factTypes) || !corpusHasCurrencyAmounts(lines)) {
        return vocabulary;
    }
    const currencyFact: FactType = {
        id: "contract_amount",
        label: "Contract amount",
        quantity: "currency",
        cues: vocabulary.language.startsWith("it")
            ? ["importo", "costo", "prezzo", "valore", "spesa", "liquidazione", "impegno", "pagamento"]
            : ["amount", "cost", "price", "value", "fee"],
        aggregation: "sum",
        isDefault: true,
    };
    const withoutDefault = vocabulary.factTypes.map((factType) => factType.isDefault && factType.quantity === "currency"
        ? { ...factType, isDefault: false }
        : factType);
    return {
        ...vocabulary,
        factTypes: [...withoutDefault, currencyFact],
    };
}
