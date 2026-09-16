import type { DocumentCatalogEntry, DocumentField } from "./document-catalog.js";

export const DOCUMENT_INFRASTRUCTURE_COLUMNS = ["document_id", "source_file", "page_count"] as const;

export const DOCUMENT_ENRICHMENT_FIELD_TOPICS = "topics";
export const DOCUMENT_ENRICHMENT_FIELD_SUMMARY = "summary";

export type DocumentInfrastructureColumn = (typeof DOCUMENT_INFRASTRUCTURE_COLUMNS)[number];

export function normalizeDocumentFieldKey(raw: string): string {
    const normalized = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized.length > 0 ? normalized : "field";
}

export function documentField(value: string | null, confidence: number): DocumentField {
    return { value, confidence };
}

export function fieldsFromRecord(
    record: Record<string, string | null | undefined>,
    confidence: number,
): Record<string, DocumentField> {
    const fields: Record<string, DocumentField> = {};
    for (const [rawKey, rawValue] of Object.entries(record)) {
        if (rawValue === undefined) {
            continue;
        }
        const key = normalizeDocumentFieldKey(rawKey);
        fields[key] = documentField(rawValue, confidence);
    }
    return fields;
}

export function collectDocumentFieldKeys(documents: DocumentCatalogEntry[]): string[] {
    const keys = new Set<string>();
    for (const document of documents) {
        for (const key of Object.keys(document.fields)) {
            keys.add(key);
        }
    }
    return [...keys].sort();
}

export function getDocumentFieldValue(document: DocumentCatalogEntry, key: string): string | null {
    return document.fields[normalizeDocumentFieldKey(key)]?.value ?? null;
}

export function mergeDocumentFields(
    existing: Record<string, DocumentField>,
    incoming: Record<string, DocumentField>,
): Record<string, DocumentField> {
    return { ...existing, ...incoming };
}

export function isDocumentInfrastructureColumn(column: string): column is DocumentInfrastructureColumn {
    return (DOCUMENT_INFRASTRUCTURE_COLUMNS as readonly string[]).includes(column);
}

export function enrichmentFieldValues(
    document: DocumentCatalogEntry,
): Record<string, string | null | undefined> {
    return {
        [DOCUMENT_ENRICHMENT_FIELD_TOPICS]: document.fields[DOCUMENT_ENRICHMENT_FIELD_TOPICS]?.value,
        [DOCUMENT_ENRICHMENT_FIELD_SUMMARY]: document.fields[DOCUMENT_ENRICHMENT_FIELD_SUMMARY]?.value,
    };
}

export function hasEnrichmentFieldValues(fields: Record<string, string | null | undefined>): boolean {
    return fields[DOCUMENT_ENRICHMENT_FIELD_TOPICS] !== undefined
        || fields[DOCUMENT_ENRICHMENT_FIELD_SUMMARY] !== undefined;
}

const DEFAULT_ENRICHMENT_SAMPLE_MIN_LENGTH = 20;

export function longestDocumentFieldValue(
    document: DocumentCatalogEntry,
    minLength = DEFAULT_ENRICHMENT_SAMPLE_MIN_LENGTH,
): string | null {
    let longest: string | null = null;
    for (const field of Object.values(document.fields)) {
        const value = field.value;
        if (value === null || value.length < minLength) {
            continue;
        }
        if (longest === null || value.length > longest.length) {
            longest = value;
        }
    }
    return longest;
}
