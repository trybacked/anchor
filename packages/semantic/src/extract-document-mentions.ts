import { ENTITY_MENTION_TYPE, MENTION_CONTEXT_LINE_RADIUS, MENTION_CONTEXT_MAX_CHARS } from "@backed/core";
import type { DomainVocabulary, IdentifierFormat, NameConvention } from "@backed/core";
import { ENTITY_MENTION_CONFIDENCE, IDENTIFIER_CHARSET_PATTERNS, IDENTIFIER_MENTION_CONFIDENCE, MENTION_ENTITY_ID_MAX_LENGTH, MENTION_ID_MAX_LENGTH, MENTION_MAX_NAME_WORDS, MENTION_MIN_NAME_CHARS, MENTION_MIN_WORD_CHARS, } from "./constants.js";
import { attributeIdentifierEntityId } from "./mention-attribution.js";
import { slugify } from "./string-utils.js";
export interface RawDocumentMention {
    documentId: string;
    mentionType: string;
    text: string;
    normalizedValue: string;
    page: number;
    line: number;
    confidence: number;
    context: string;
}
export interface DocumentLineRow {
    document_id: string;
    page: number;
    line: number;
    text: string;
}
export interface EntityRecord {
    entityId: string;
    name: string;
    normalizedName: string;
    mentionCount: number;
    documentCount: number;
    sector?: string | null;
    role?: string | null;
    summary?: string | null;
    enrichmentConfidence?: number | null;
}
function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function identifierPattern(format: IdentifierFormat): RegExp {
    const cues = format.cues.map(escapeForRegex).join("|");
    const charset = IDENTIFIER_CHARSET_PATTERNS[format.charset];
    const length = `{${String(format.minLength)},${String(format.maxLength)}}`;
    return new RegExp(`\\b(?:${cues})[:\\s]*(${charset}${length})\\b`, "gi");
}
function suffixPattern(conventions: NameConvention): RegExp | null {
    if (conventions.suffixes.length === 0) {
        return null;
    }
    const alternatives = conventions.suffixes
        .map((suffix) => [...suffix.replace(/[^\p{L}\p{N}]/gu, "")]
        .map((character) => `${escapeForRegex(character)}\\.?\\s*`)
        .join(""))
        .join("|");
    return new RegExp(`\\s+(${alternatives})(?=\\b|$)`, "giu");
}
function leadingNoisePattern(conventions: NameConvention): RegExp | null {
    if (conventions.leadingNoise.length === 0) {
        return null;
    }
    const words = conventions.leadingNoise.map(escapeForRegex).join("|");
    return new RegExp(`^(?:${words})\\s+`, "iu");
}
export function normalizeEntityName(value: string): string {
    return value.replace(/\s+/g, " ").trim().toUpperCase();
}
export function entityIdFromName(normalizedName: string): string {
    return slugify(normalizedName).slice(0, MENTION_ENTITY_ID_MAX_LENGTH);
}
function extractNamesFromText(text: string, conventions: NameConvention): Array<{
    text: string;
    normalizedValue: string;
}> {
    const pattern = suffixPattern(conventions);
    if (pattern === null) {
        return [];
    }
    const noise = leadingNoisePattern(conventions);
    const results: Array<{
        text: string;
        normalizedValue: string;
    }> = [];
    for (const match of text.matchAll(pattern)) {
        const words = text.slice(0, match.index ?? 0).trim().split(/\s+/);
        const nameWords: string[] = [];
        for (let index = words.length - 1; index >= 0 && nameWords.length < MENTION_MAX_NAME_WORDS; index -= 1) {
            const word = words[index];
            if (word === undefined || word.length < MENTION_MIN_WORD_CHARS) {
                break;
            }
            if (!/^[\p{L}\p{N}&.'’-]+$/u.test(word) || word === word.toLowerCase()) {
                break;
            }
            nameWords.unshift(word);
        }
        if (nameWords.length === 0) {
            continue;
        }
        const raw = `${nameWords.join(" ")}${match[0]}`.replace(/\s+/g, " ").trim();
        const trimmed = noise === null ? raw : raw.replace(noise, "").trim();
        if (trimmed.length < MENTION_MIN_NAME_CHARS) {
            continue;
        }
        results.push({ text: trimmed, normalizedValue: normalizeEntityName(trimmed) });
    }
    return results;
}
function mentionId(documentId: string, mentionType: string, normalizedValue: string, page: number, line: number): string {
    return `${documentId}:${mentionType}:${normalizedValue}:${String(page)}:${String(line)}`
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, "_")
        .slice(0, MENTION_ID_MAX_LENGTH);
}
function lineContextKey(documentId: string, page: number, line: number): string {
    return `${documentId}:${String(page)}:${String(line)}`;
}
export function buildLineContextMap(rows: DocumentLineRow[], radius = MENTION_CONTEXT_LINE_RADIUS, maxChars = MENTION_CONTEXT_MAX_CHARS): Map<string, string> {
    const byDocument = new Map<string, DocumentLineRow[]>();
    for (const row of rows) {
        const documentRows = byDocument.get(row.document_id) ?? [];
        documentRows.push(row);
        byDocument.set(row.document_id, documentRows);
    }
    const contextMap = new Map<string, string>();
    for (const documentRows of byDocument.values()) {
        for (let index = 0; index < documentRows.length; index += 1) {
            const row = documentRows[index];
            if (row === undefined) {
                continue;
            }
            const start = Math.max(0, index - radius);
            const end = Math.min(documentRows.length - 1, index + radius);
            const context = documentRows
                .slice(start, end + 1)
                .map((entry) => entry.text.trim())
                .filter((text) => text.length > 0)
                .join(" ")
                .slice(0, maxChars);
            contextMap.set(lineContextKey(row.document_id, row.page, row.line), context);
        }
    }
    return contextMap;
}
export function extractMentionsFromLine(row: DocumentLineRow, vocabulary: DomainVocabulary, context?: string): RawDocumentMention[] {
    const mentionContext = context ?? row.text.trim().slice(0, MENTION_CONTEXT_MAX_CHARS);
    const mentions: RawDocumentMention[] = [];
    const seen = new Set<string>();
    const push = (mentionType: string, text: string, normalizedValue: string, confidence: number): void => {
        const key = `${mentionType}:${normalizedValue}:${row.document_id}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        mentions.push({
            documentId: row.document_id,
            mentionType,
            text,
            normalizedValue,
            page: row.page,
            line: row.line,
            confidence,
            context: mentionContext,
        });
    };
    for (const name of extractNamesFromText(row.text, vocabulary.nameConventions)) {
        push(ENTITY_MENTION_TYPE, name.text, name.normalizedValue, ENTITY_MENTION_CONFIDENCE);
    }
    for (const format of vocabulary.identifierFormats) {
        for (const match of row.text.matchAll(identifierPattern(format))) {
            const code = match[1]?.trim().toUpperCase();
            if (code === undefined) {
                continue;
            }
            push(format.id, match[0].trim(), code, IDENTIFIER_MENTION_CONFIDENCE);
        }
    }
    return mentions;
}
export function extractMentionsFromLines(rows: DocumentLineRow[], vocabulary: DomainVocabulary): RawDocumentMention[] {
    const contextMap = buildLineContextMap(rows);
    return rows.flatMap((row) => extractMentionsFromLine(row, vocabulary, contextMap.get(lineContextKey(row.document_id, row.page, row.line))));
}
export function buildEntityIndex(mentions: RawDocumentMention[]): Map<string, EntityRecord> {
    const index = new Map<string, EntityRecord>();
    const documentsByEntity = new Map<string, Set<string>>();
    for (const mention of mentions) {
        if (mention.mentionType !== ENTITY_MENTION_TYPE) {
            continue;
        }
        const id = entityIdFromName(mention.normalizedValue);
        const existing = index.get(id);
        if (existing === undefined) {
            index.set(id, {
                entityId: id,
                name: mention.text.trim(),
                normalizedName: mention.normalizedValue,
                mentionCount: 1,
                documentCount: 0,
            });
        }
        else {
            existing.mentionCount += 1;
        }
        const documents = documentsByEntity.get(id) ?? new Set<string>();
        documents.add(mention.documentId);
        documentsByEntity.set(id, documents);
    }
    for (const [id, record] of index) {
        record.documentCount = documentsByEntity.get(id)?.size ?? 0;
    }
    return index;
}
export interface MaterializedMentionRow {
    mentionId: string;
    documentId: string;
    entityId: string | null;
    mentionType: string;
    text: string;
    normalizedValue: string;
    page: number;
    line: number;
    confidence: number;
    context: string;
}
export function toMaterializedMentions(mentions: RawDocumentMention[], entities: Map<string, EntityRecord>): MaterializedMentionRow[] {
    const entityMentions = mentions.filter((mention) => mention.mentionType === ENTITY_MENTION_TYPE);
    return mentions.map((mention) => ({
        mentionId: mentionId(mention.documentId, mention.mentionType, mention.normalizedValue, mention.page, mention.line),
        documentId: mention.documentId,
        entityId: mention.mentionType === ENTITY_MENTION_TYPE
            ? (entities.get(entityIdFromName(mention.normalizedValue))?.entityId ?? null)
            : attributeIdentifierEntityId(mention, entities, entityMentions),
        mentionType: mention.mentionType,
        text: mention.text,
        normalizedValue: mention.normalizedValue,
        page: mention.page,
        line: mention.line,
        confidence: mention.confidence,
        context: mention.context,
    }));
}
