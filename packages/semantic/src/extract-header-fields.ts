import { EMPTY_DOMAIN_VOCABULARY } from "@backed/core";
import type { DomainVocabulary } from "@backed/core";
import { BOILERPLATE_DOCUMENT_RATIO, BOILERPLATE_MIN_DOCUMENTS, HEADER_ALL_CAPS_MIN_LETTERS, HEADER_MAX_SUBJECT_CHARS, HEADER_MIN_SLUG_NUMBER_DIGITS, HEADER_MIN_SUBJECT_CHARS, HEADER_OCR_MIN_ALPHANUMERIC_RATIO, } from "./constants.js";
export interface ExtractedHeaderFields {
    protocolNumber: string | null;
    publishedDate: string | null;
    subject: string | null;
    issuingOffice: string | null;
}
export interface HeaderFieldContext {
    vocabulary: DomainVocabulary;
    recurringLines: Set<string>;
}
const NUMBER_IN_SLUG = new RegExp(`(?:^|[_-])(\\d{${String(HEADER_MIN_SLUG_NUMBER_DIGITS)},})(?=[_-]|$)`);
const DATE_IN_SLUG = /(?:^|[_-])(\d{1,4})[_.-](\d{1,2})[_.-](\d{2,4})(?=[_-]|$)/;
const DATE_IN_TEXT = /\b(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4})\b/;
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
function toIsoDate(parts: [
    string,
    string,
    string
], order: DomainVocabulary["dateOrder"]): string | null {
    const numbers = parts.map((part) => Number.parseInt(part, 10));
    if (numbers.some((value) => !Number.isFinite(value))) {
        return null;
    }
    const [first, second, third] = numbers as [
        number,
        number,
        number
    ];
    const resolved = first > 31
        ? { year: first, month: second, day: third }
        : order === "year_first"
            ? { year: first, month: second, day: third }
            : order === "month_first" && second <= 12
                ? { year: third, month: first, day: second }
                : { year: third, month: second, day: first };
    if (resolved.month < 1 || resolved.month > 12 || resolved.day < 1 || resolved.day > 31) {
        return null;
    }
    const year = resolved.year < 100 ? 2000 + resolved.year : resolved.year;
    return `${String(year).padStart(4, "0")}-${String(resolved.month).padStart(2, "0")}-${String(resolved.day).padStart(2, "0")}`;
}
function matchDate(pattern: RegExp, text: string, order: DomainVocabulary["dateOrder"]): string | null {
    const match = pattern.exec(text);
    if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
        return null;
    }
    return toIsoDate([match[1], match[2], match[3]], order);
}
function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractNumberFromText(text: string, vocabulary: DomainVocabulary): string | null {
    const cues = vocabulary.identifierFormats.flatMap((format) => format.cues);
    if (cues.length === 0) {
        return null;
    }
    const pattern = new RegExp(`\\b(?:${cues.map(escapeForRegex).join("|")})\\s*[:.]?\\s*(\\d[\\d./-]*\\d|\\d+)`, "i");
    return pattern.exec(text)?.[1] ?? null;
}
function extractSubject(headerLines: string[], recurringLines: Set<string>): string | null {
    for (const line of headerLines) {
        const trimmed = line.trim();
        if (isOcrNoiseLine(trimmed) || recurringLines.has(normalizeLine(trimmed))) {
            continue;
        }
        if (trimmed.length >= HEADER_MIN_SUBJECT_CHARS) {
            return trimmed.length > HEADER_MAX_SUBJECT_CHARS
                ? `${trimmed.slice(0, HEADER_MAX_SUBJECT_CHARS - 3)}...`
                : trimmed;
        }
    }
    return null;
}
function extractIssuingOffice(headerLines: string[], recurringLines: Set<string>): string | null {
    for (const line of headerLines) {
        const trimmed = line.trim();
        if (trimmed.length >= HEADER_MIN_SUBJECT_CHARS && recurringLines.has(normalizeLine(trimmed))) {
            return trimmed.length > HEADER_MAX_SUBJECT_CHARS
                ? trimmed.slice(0, HEADER_MAX_SUBJECT_CHARS)
                : trimmed;
        }
    }
    return null;
}
export function normalizeLine(line: string): string {
    return line.trim().toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
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
export function extractHeaderFields(sourceTable: string, headerLines: string[], context: HeaderFieldContext = {
    vocabulary: EMPTY_DOMAIN_VOCABULARY,
    recurringLines: new Set(),
}): ExtractedHeaderFields {
    const { vocabulary, recurringLines } = context;
    const text = headerLines.join("\n");
    return {
        protocolNumber: extractNumberFromText(text, vocabulary) ?? NUMBER_IN_SLUG.exec(sourceTable)?.[1] ?? null,
        publishedDate: matchDate(DATE_IN_TEXT, text, vocabulary.dateOrder) ??
            matchDate(DATE_IN_SLUG, sourceTable, vocabulary.dateOrder),
        subject: extractSubject(headerLines, recurringLines),
        issuingOffice: extractIssuingOffice(headerLines, recurringLines),
    };
}
