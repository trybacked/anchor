import { EMPTY_DOMAIN_VOCABULARY, normalizeComparableLine, normalizeDocumentFieldKey } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
import { BOILERPLATE_DOCUMENT_RATIO, BOILERPLATE_MIN_DOCUMENTS, HEADER_ALL_CAPS_MIN_LETTERS, HEADER_OCR_MIN_ALPHANUMERIC_RATIO, } from "./constants.js";

export interface HeaderFieldContext {
    vocabulary: DomainVocabulary;
    recurringLines: Set<string>;
}

export function normalizeLine(line: string): string {
    return normalizeComparableLine(line);
}

export function isOcrNoiseLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return true;
    }
    if (/^[\s\-_=|*#./\\:+]+$/.test(trimmed)) {
        return true;
    }
    const alphanumeric = (trimmed.match(/[\p{L}\p{N}]/gu) ?? []).length;
    if (alphanumeric / trimmed.length < HEADER_OCR_MIN_ALPHANUMERIC_RATIO) {
        return true;
    }
    const letters = trimmed.match(/\p{L}/gu) ?? [];
    return (letters.length >= HEADER_ALL_CAPS_MIN_LETTERS &&
        letters.every((letter) => letter === letter.toUpperCase()));
}

function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractIdentifierForFormat(text: string, format: DomainVocabulary["identifierFormats"][number]): string | null {
    if (format.cues.length === 0) {
        return null;
    }
    const pattern = new RegExp(`\\b(?:${format.cues.map(escapeForRegex).join("|")})\\s*[:.]?\\s*(\\S+)`, "i");
    const match = pattern.exec(text);
    if (match?.[1] === undefined) {
        return null;
    }
    const value = match[1].replace(/[.,;]+$/, "");
    if (value.length < format.minLength || value.length > format.maxLength) {
        return null;
    }
    return value;
}

export function extractVocabularyFields(
    headerLines: string[],
    vocabulary: DomainVocabulary = EMPTY_DOMAIN_VOCABULARY,
): Record<string, string> {
    const text = headerLines.join("\n");
    const fields: Record<string, string> = {};
    for (const format of vocabulary.identifierFormats) {
        const value = extractIdentifierForFormat(text, format);
        if (value !== null) {
            fields[normalizeDocumentFieldKey(format.id)] = value;
        }
    }
    return fields;
}

export function filterHeaderLinesForLlm(headerLines: string[], recurringLines: Set<string>): string[] {
    return headerLines.filter((line) => {
        const normalized = normalizeLine(line);
        return normalized.length > 0 && !recurringLines.has(normalized);
    });
}

export function findRecurringLines(headerLinesBySample: string[][], ratio = BOILERPLATE_DOCUMENT_RATIO, minSamples = BOILERPLATE_MIN_DOCUMENTS): Set<string> {
    if (headerLinesBySample.length < minSamples) {
        return new Set();
    }
    const counts = new Map<string, number>();
    for (const lines of headerLinesBySample) {
        for (const key of new Set(lines.map(normalizeLine))) {
            if (key.length > 0) {
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
    }
    const threshold = headerLinesBySample.length * ratio;
    return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([key]) => key));
}
