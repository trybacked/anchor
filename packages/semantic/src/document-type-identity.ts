import type { DocumentCatalog, DocumentCatalogEntry, Entity } from "@backed/core";
import { DOC_TYPE_TABLE_PREFIX } from "@backed/core";
import { slugify } from "./string-utils.js";

export const DOCUMENT_TYPE_STABLE_KEY_PREFIX = "stable-key:";

export function normalizeDocumentTypeId(raw: string): string {
    const normalized = slugify(raw.trim());
    return normalized.length > 0 ? normalized : "unknown";
}

export function documentTypeStableKey(documentType: string): string {
    return normalizeDocumentTypeId(documentType);
}

export function documentTypeEntityId(documentType: string): string {
    return `dtype_${documentTypeStableKey(documentType)}`;
}

export function documentTypeStableKeyEvidence(stableKey: string, detail: string): string {
    return `${DOCUMENT_TYPE_STABLE_KEY_PREFIX}${stableKey}; ${detail}`;
}

export function parseDocumentTypeStableKey(evidence: string): string | undefined {
    const markerIndex = evidence.indexOf(DOCUMENT_TYPE_STABLE_KEY_PREFIX);
    if (markerIndex === -1) {
        return undefined;
    }
    const afterMarker = evidence.slice(markerIndex + DOCUMENT_TYPE_STABLE_KEY_PREFIX.length);
    const separatorIndex = afterMarker.indexOf(";");
    const stableKey = separatorIndex === -1 ? afterMarker.trim() : afterMarker.slice(0, separatorIndex).trim();
    if (stableKey.length === 0) {
        return undefined;
    }
    const legacyFingerprintSeparator = stableKey.indexOf("::");
    if (legacyFingerprintSeparator !== -1) {
        return normalizeDocumentTypeId(stableKey.slice(0, legacyFingerprintSeparator));
    }
    return normalizeDocumentTypeId(stableKey);
}

export function documentTypeStableKeyFromSourceTable(sourceTable: string): string | undefined {
    if (!isDocumentTypeTableName(sourceTable)) {
        return undefined;
    }
    const typeSlug = sourceTable.slice(DOC_TYPE_TABLE_PREFIX.length);
    return normalizeDocumentTypeId(typeSlug);
}

export function resolveTypeHeaderContentFingerprint(documents: DocumentCatalogEntry[]): string {
    const fingerprints = documents
        .map((document) => document.headerContentFingerprint ?? document.headerFingerprint)
        .filter((fingerprint): fingerprint is string => fingerprint !== undefined)
        .sort();
    return fingerprints[0] ?? "unknown";
}

export function resolveTypeHeaderContentFingerprintForType(
    catalog: DocumentCatalog,
    typeId: string,
): string {
    const documents = catalog.documents.filter((document) => document.documentType === typeId);
    return resolveTypeHeaderContentFingerprint(documents);
}

export function isDocumentTypeTableName(tableName: string): boolean {
    return tableName.startsWith(DOC_TYPE_TABLE_PREFIX);
}

export function isDocumentTypeEntity(entity: Entity): boolean {
    return isDocumentTypeTableName(entity.sourceTable) || entity.id.startsWith("dtype_");
}

export function stableKeyFromEntity(entity: Entity): string | undefined {
    const fromEvidence = parseDocumentTypeStableKey(entity.provenance.evidence);
    if (fromEvidence !== undefined) {
        return fromEvidence;
    }
    const fromSourceTable = documentTypeStableKeyFromSourceTable(entity.sourceTable);
    if (fromSourceTable !== undefined) {
        return fromSourceTable;
    }
    if (entity.id.startsWith("dtype_")) {
        const suffix = entity.id.slice("dtype_".length);
        if (/^[a-f0-9]{16}$/i.test(suffix)) {
            return undefined;
        }
        return normalizeDocumentTypeId(suffix);
    }
    return undefined;
}
