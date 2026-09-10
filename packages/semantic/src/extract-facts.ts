import { ENTITY_MENTION_TYPE, parseLocalizedNumber } from "@backed/core";
import type { DomainVocabulary, FactType, NumberFormat } from "@backed/core";
import { entityIdFromName } from "./extract-document-mentions.js";
import type { DocumentLineRow, RawDocumentMention } from "./extract-document-mentions.js";
import { FACT_CUE_WINDOW_CHARS, MENTION_ID_MAX_LENGTH } from "./constants.js";
import { nearestMention } from "./mention-attribution.js";
export { FACT_CUE_WINDOW_CHARS, FACT_LINE_WINDOW } from "./constants.js";
const CURRENCY_MARK = "(?:[€$£¥₹₽₺¢]|\\b(?:EUR|USD|GBP|CHF|JPY|CNY|SEK|NOK|DKK|PLN|CAD|AUD)\\b|\\b[Ee]ur[oi]\\b)";
export interface RawFact {
    factId: string;
    documentId: string;
    entityId: string | null;
    identifierType: string | null;
    identifierValue: string | null;
    factType: string;
    amount: number | null;
    rawText: string;
    page: number;
    line: number;
}
function numberPattern(format: NumberFormat): string {
    return format === "decimal_comma"
        ? "\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,3})?|\\d+(?:,\\d{1,3})?"
        : "\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,3})?|\\d+(?:\\.\\d{1,3})?";
}
function currencyPattern(format: NumberFormat): RegExp {
    const number = numberPattern(format);
    return new RegExp(`${CURRENCY_MARK}\\s*(${number})|(${number})\\s*${CURRENCY_MARK}`, "gi");
}
function percentagePattern(format: NumberFormat): RegExp {
    return new RegExp(`(${numberPattern(format)})\\s*%`, "gi");
}
function factId(documentId: string, factType: string, page: number, line: number, rawText: string): string {
    return `${documentId}:${factType}:${String(page)}:${String(line)}:${rawText}`
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, "_")
        .slice(0, MENTION_ID_MAX_LENGTH);
}
interface NearbyMentions {
    entities: Array<{
        id: string;
        page: number;
        line: number;
    }>;
    identifiers: Array<{
        type: string;
        value: string;
        page: number;
        line: number;
    }>;
}
function buildNearbyMentions(mentions: RawDocumentMention[], documentId: string): NearbyMentions {
    const entities: NearbyMentions["entities"] = [];
    const identifiers: NearbyMentions["identifiers"] = [];
    for (const mention of mentions) {
        if (mention.documentId !== documentId) {
            continue;
        }
        if (mention.mentionType === ENTITY_MENTION_TYPE) {
            entities.push({
                id: entityIdFromName(mention.normalizedValue),
                page: mention.page,
                line: mention.line,
            });
        }
        else {
            identifiers.push({
                type: mention.mentionType,
                value: mention.normalizedValue,
                page: mention.page,
                line: mention.line,
            });
        }
    }
    return { entities, identifiers };
}
function classifyQuantity(text: string, quantityEnd: number, candidates: FactType[]): FactType | null {
    const window = text.slice(Math.max(0, quantityEnd - FACT_CUE_WINDOW_CHARS), quantityEnd).toLowerCase();
    let best: {
        factType: FactType;
        position: number;
    } | null = null;
    for (const candidate of candidates) {
        for (const cue of candidate.cues) {
            const position = window.lastIndexOf(cue.toLowerCase());
            if (position < 0) {
                continue;
            }
            if (best === null || position > best.position) {
                best = { factType: candidate, position };
            }
        }
    }
    return best?.factType ?? candidates.find((candidate) => candidate.isDefault) ?? null;
}
function collectQuantities(row: DocumentLineRow, pattern: RegExp, candidates: FactType[], numberFormat: NumberFormat, nearby: NearbyMentions): RawFact[] {
    if (candidates.length === 0) {
        return [];
    }
    const facts: RawFact[] = [];
    for (const match of row.text.matchAll(pattern)) {
        const raw = match[1] ?? match[2];
        const rawText = match[0].trim();
        if (raw === undefined || rawText.length === 0) {
            continue;
        }
        const factType = classifyQuantity(row.text, match.index + rawText.length, candidates);
        if (factType === null) {
            continue;
        }
        const entity = nearestMention(nearby.entities, row.page, row.line);
        const identifier = nearestMention(nearby.identifiers, row.page, row.line);
        facts.push({
            factId: factId(row.document_id, factType.id, row.page, row.line, rawText),
            documentId: row.document_id,
            entityId: entity?.id ?? null,
            identifierType: identifier?.type ?? null,
            identifierValue: identifier?.value ?? null,
            factType: factType.id,
            amount: parseLocalizedNumber(raw, numberFormat),
            rawText,
            page: row.page,
            line: row.line,
        });
    }
    return facts;
}
export function extractFactsFromLine(row: DocumentLineRow, mentions: RawDocumentMention[], vocabulary: DomainVocabulary): RawFact[] {
    const nearby = buildNearbyMentions(mentions, row.document_id);
    const byQuantity = (quantity: FactType["quantity"]): FactType[] => vocabulary.factTypes.filter((factType) => factType.quantity === quantity);
    return [
        ...collectQuantities(row, currencyPattern(vocabulary.numberFormat), byQuantity("currency"), vocabulary.numberFormat, nearby),
        ...collectQuantities(row, percentagePattern(vocabulary.numberFormat), byQuantity("percentage"), vocabulary.numberFormat, nearby),
    ];
}
export function extractFactsFromLines(rows: DocumentLineRow[], mentions: RawDocumentMention[], vocabulary: DomainVocabulary): RawFact[] {
    const seen = new Set<string>();
    const facts: RawFact[] = [];
    for (const row of rows) {
        for (const fact of extractFactsFromLine(row, mentions, vocabulary)) {
            if (seen.has(fact.factId)) {
                continue;
            }
            seen.add(fact.factId);
            facts.push(fact);
        }
    }
    return facts;
}
