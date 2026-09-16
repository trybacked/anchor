import path from "node:path";
import type { DocumentCatalog, DocumentCatalogEntry } from "@backed/core";
import type { DocumentLineRow } from "@backed/semantic";

export function normalizeSourceBasename(sourceRef: string): string {
    return path.basename(sourceRef);
}

export function resolveNewDocumentSourceTables(
    documents: DocumentCatalogEntry[],
    unknownSourceFiles: string[] | undefined,
    persistedCatalog: DocumentCatalog | undefined,
): Set<string> {
    const unknown = unknownSourceFiles === undefined
        ? undefined
        : new Set(unknownSourceFiles.map((fileName) => normalizeSourceBasename(fileName)));
    const newTables = new Set<string>();
    for (const document of documents) {
        const fileRef = document.sourceFile ?? document.sourceTable;
        if (unknown?.has(normalizeSourceBasename(fileRef)) === true) {
            newTables.add(document.sourceTable);
            continue;
        }
        if (unknown !== undefined) {
            continue;
        }
        if (persistedCatalog === undefined) {
            newTables.add(document.sourceTable);
            continue;
        }
        const known = persistedCatalog.documents.some((entry) => entry.sourceTable === document.sourceTable);
        if (!known) {
            newTables.add(document.sourceTable);
        }
    }
    return newTables;
}

export function filterLineRowsByDocumentIds(
    lineRows: DocumentLineRow[],
    documentIds: Set<string>,
): DocumentLineRow[] {
    if (documentIds.size === 0) {
        return lineRows;
    }
    return lineRows.filter((row) => documentIds.has(row.document_id));
}

export function mergeEnrichedDocuments(
    documents: DocumentCatalogEntry[],
    enrichedDocuments: DocumentCatalogEntry[],
): DocumentCatalogEntry[] {
    const enrichedBySource = new Map(enrichedDocuments.map((document) => [document.sourceTable, document]));
    return documents.map((document) => enrichedBySource.get(document.sourceTable) ?? document);
}
