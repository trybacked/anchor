import { FACT_LINE_WINDOW, FACT_PAGE_LINE_STRIDE } from "./constants.js";
import type { EntityRecord, RawDocumentMention } from "./extract-document-mentions.js";
import { entityIdFromName } from "./extract-document-mentions.js";
function lineOrdinal(page: number, line: number): number {
    return page * FACT_PAGE_LINE_STRIDE + line;
}
export function nearestMention<T extends {
    page: number;
    line: number;
}>(items: T[], page: number, line: number): T | null {
    if (items.length === 0) {
        return null;
    }
    const factOrdinal = lineOrdinal(page, line);
    const followingTolerance = Math.max(3, Math.floor(FACT_LINE_WINDOW / 4));
    let best: {
        item: T;
        score: number;
    } | null = null;
    for (const item of items) {
        const delta = factOrdinal - lineOrdinal(item.page, item.line);
        if (delta < -followingTolerance || delta > FACT_LINE_WINDOW) {
            continue;
        }
        const score = delta >= 0 ? delta : FACT_LINE_WINDOW + -delta * 3;
        if (best === null || score < best.score) {
            best = { item, score };
        }
    }
    return best?.item ?? null;
}
export function attributeIdentifierEntityId(mention: RawDocumentMention, entities: Map<string, EntityRecord>, entityMentions: RawDocumentMention[]): string | null {
    const contextLower = mention.context.toLowerCase();
    const matchingEntities = [...entities.values()].filter((entity) => contextLower.includes(entity.normalizedName.toLowerCase()));
    if (matchingEntities.length === 0) {
        return null;
    }
    if (matchingEntities.length === 1) {
        return matchingEntities[0]?.entityId ?? null;
    }
    const matchingNames = new Set(matchingEntities.map((entity) => entity.normalizedName));
    const candidateMentions = entityMentions.filter((entityMention) => entityMention.documentId === mention.documentId &&
        matchingNames.has(entityMention.normalizedValue));
    const nearest = nearestMention(candidateMentions, mention.page, mention.line);
    return nearest === null ? null : entityIdFromName(nearest.normalizedValue);
}
