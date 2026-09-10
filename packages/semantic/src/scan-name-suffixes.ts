import type { DocumentLineRow } from "./extract-document-mentions.js";
import { REJECTED_NAME_SUFFIXES, SUFFIX_MAX_LENGTH, SUFFIX_MAX_RESULTS, SUFFIX_MIN_DOCUMENTS, SUFFIX_MIN_LENGTH, } from "./constants.js";
const DOTTED_SUFFIX_PATTERN = /\s((?:[\p{Lu}]\.\s*){2,}[\p{Lu}]\.?)/gu;
const CAPS_SUFFIX_PATTERN = /\b(?:[A-Z]{2,}(?:\s+[A-Z]{2,}){0,5})\s+([A-Z]{3,4})\b(?!\.\s*[\p{Lu}])/gu;
function normalizeSuffix(raw: string): string {
    return raw.replace(/[^\p{L}]/gu, "").toLowerCase();
}
function isPlausibleSuffix(raw: string): boolean {
    const suffix = normalizeSuffix(raw);
    return (suffix.length >= SUFFIX_MIN_LENGTH &&
        suffix.length <= SUFFIX_MAX_LENGTH &&
        !REJECTED_NAME_SUFFIXES.has(suffix));
}
function recordSuffix(documentsBySuffix: Map<string, Set<string>>, raw: string, documentId: string): void {
    if (!isPlausibleSuffix(raw)) {
        return;
    }
    const suffix = normalizeSuffix(raw);
    const documents = documentsBySuffix.get(suffix) ?? new Set<string>();
    documents.add(documentId);
    documentsBySuffix.set(suffix, documents);
}
export function scanNameSuffixes(lines: DocumentLineRow[]): string[] {
    const documentsBySuffix = new Map<string, Set<string>>();
    for (const row of lines) {
        for (const match of row.text.matchAll(DOTTED_SUFFIX_PATTERN)) {
            recordSuffix(documentsBySuffix, match[1] ?? "", row.document_id);
        }
        for (const match of row.text.matchAll(CAPS_SUFFIX_PATTERN)) {
            recordSuffix(documentsBySuffix, match[1] ?? "", row.document_id);
        }
    }
    return [...documentsBySuffix.entries()]
        .filter(([, documents]) => documents.size >= SUFFIX_MIN_DOCUMENTS)
        .sort((left, right) => right[1].size - left[1].size)
        .slice(0, SUFFIX_MAX_RESULTS)
        .map(([suffix]) => suffix);
}
export function filterPlausibleSuffixes(suffixes: string[]): string[] {
    return [...new Set(suffixes.filter((suffix) => isPlausibleSuffix(suffix)))];
}
