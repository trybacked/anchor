import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
    DOCUMENT_CHUNKS_TABLE,
    DOCUMENT_ENTITIES_TABLE,
    DOCUMENT_FACTS_TABLE,
    DOCUMENT_LINES_TABLE,
    DOCUMENT_MENTIONS_TABLE,
    DocumentCatalogSchema,
    DomainVocabularySchema,
    ENTITY_PROFILES_TABLE,
    ProfileReportSchema,
    documentTypeTableName,
} from "@backed/core";
import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeSummary, DomainVocabulary, ProfileReport } from "@backed/core";
import type { DocumentTypeRegistryEntry } from "@backed/semantic";
import { JSON_PRETTY_INDENT } from "./config.js";

export const PERSIST_VOCABULARY_FILE = "vocabulary.json";
export const PERSIST_DOCUMENTS_FILE = "documents.json";
export const PERSIST_PROFILE_FILE = "profile.json";

const DOCUMENT_TYPE_SAMPLE_TABLE_LIMIT = 3;

const PIPELINE_INFRA_TABLES = new Set<string>([
    DOCUMENT_LINES_TABLE,
    DOCUMENT_CHUNKS_TABLE,
    DOCUMENT_ENTITIES_TABLE,
    DOCUMENT_MENTIONS_TABLE,
    DOCUMENT_FACTS_TABLE,
    ENTITY_PROFILES_TABLE,
]);

export interface TenantPersistedArtifacts {
    vocabulary?: DomainVocabulary;
    documentCatalog?: DocumentCatalog;
    profile?: ProfileReport;
}

export function mergeProfiles(existing: ProfileReport | undefined, incoming: ProfileReport): ProfileReport {
    if (existing === undefined) {
        return incoming;
    }
    const byTable = new Map(existing.map((table) => [table.table, table]));
    for (const table of incoming) {
        const previous = byTable.get(table.table);
        if (previous !== undefined && !PIPELINE_INFRA_TABLES.has(table.table)) {
            byTable.set(table.table, {
                ...table,
                rowCount: Math.max(previous.rowCount, table.rowCount),
            });
            continue;
        }
        byTable.set(table.table, table);
    }
    return ProfileReportSchema.parse([...byTable.values()]);
}

function rebuildDocumentTypes(documents: DocumentCatalogEntry[]): DocumentTypeSummary[] {
    const byType = new Map<string, DocumentCatalogEntry[]>();
    for (const document of documents) {
        const group = byType.get(document.documentType) ?? [];
        group.push(document);
        byType.set(document.documentType, group);
    }
    return [...byType.entries()].map(([typeId, entries]) => {
        const label = entries[0]?.documentTypeLabel ?? typeId;
        const confidence = Math.min(...entries.map((entry) => entry.confidence));
        return {
            id: typeId,
            name: label,
            tableName: documentTypeTableName(typeId),
            documentCount: entries.length,
            confidence,
            sampleSourceTables: entries
                .slice(0, DOCUMENT_TYPE_SAMPLE_TABLE_LIMIT)
                .map((entry) => entry.sourceTable),
        };
    });
}

function preserveCanonicalDocumentType(
    existing: DocumentCatalogEntry,
    incoming: DocumentCatalogEntry,
): DocumentCatalogEntry {
    return {
        ...incoming,
        documentType: existing.documentType,
        documentTypeLabel: existing.documentTypeLabel,
    };
}

export function buildDocumentTypeRegistry(catalog: DocumentCatalog): Map<string, DocumentTypeRegistryEntry> {
    return new Map(catalog.documents.map((document) => [
        document.sourceTable,
        {
            documentType: document.documentType,
            documentTypeLabel: document.documentTypeLabel,
        },
    ]));
}

export function resolveCatalogForInference(
    runCatalog: DocumentCatalog | undefined,
    persistedCatalog: DocumentCatalog | undefined,
): DocumentCatalog | undefined {
    if (runCatalog === undefined) {
        return persistedCatalog;
    }
    if (persistedCatalog === undefined) {
        return runCatalog;
    }
    return mergeDocumentCatalogs(persistedCatalog, runCatalog);
}

export function mergeDocumentCatalogs(
    existing: DocumentCatalog | undefined,
    incoming: DocumentCatalog,
): DocumentCatalog {
    if (existing === undefined) {
        return incoming;
    }
    const documentsBySource = new Map(existing.documents.map((document) => [document.sourceTable, document]));
    for (const document of incoming.documents) {
        const previous = documentsBySource.get(document.sourceTable);
        documentsBySource.set(
            document.sourceTable,
            previous !== undefined ? preserveCanonicalDocumentType(previous, document) : document,
        );
    }
    const documents = [...documentsBySource.values()];
    return DocumentCatalogSchema.parse({
        runId: incoming.runId,
        generatedAt: incoming.generatedAt,
        documents,
        documentTypes: rebuildDocumentTypes(documents),
    });
}

async function readJsonArtifact<T>(
    filePath: string,
    schema: { parse: (data: unknown) => T },
): Promise<T | undefined> {
    if (!existsSync(filePath)) {
        return undefined;
    }
    const raw = await readFile(filePath, "utf8");
    return schema.parse(JSON.parse(raw) as unknown);
}

export async function loadTenantPersistedArtifacts(persistDir: string): Promise<TenantPersistedArtifacts> {
    const vocabulary = await readJsonArtifact(
        path.join(persistDir, PERSIST_VOCABULARY_FILE),
        DomainVocabularySchema,
    );
    const documentCatalog = await readJsonArtifact(
        path.join(persistDir, PERSIST_DOCUMENTS_FILE),
        DocumentCatalogSchema,
    );
    const profile = await readJsonArtifact(
        path.join(persistDir, PERSIST_PROFILE_FILE),
        ProfileReportSchema,
    );
    return {
        ...(vocabulary !== undefined ? { vocabulary } : {}),
        ...(documentCatalog !== undefined ? { documentCatalog } : {}),
        ...(profile !== undefined ? { profile } : {}),
    };
}

export async function persistTenantVocabulary(persistDir: string, vocabulary: DomainVocabulary): Promise<void> {
    await writeFile(
        path.join(persistDir, PERSIST_VOCABULARY_FILE),
        `${JSON.stringify(DomainVocabularySchema.parse(vocabulary), null, JSON_PRETTY_INDENT)}\n`,
        "utf8",
    );
}

export async function persistTenantDocumentCatalog(
    persistDir: string,
    catalog: DocumentCatalog,
): Promise<DocumentCatalog> {
    const existing = await readJsonArtifact(
        path.join(persistDir, PERSIST_DOCUMENTS_FILE),
        DocumentCatalogSchema,
    );
    const merged = mergeDocumentCatalogs(existing, catalog);
    await writeFile(
        path.join(persistDir, PERSIST_DOCUMENTS_FILE),
        `${JSON.stringify(merged, null, JSON_PRETTY_INDENT)}\n`,
        "utf8",
    );
    return merged;
}

export async function persistTenantProfile(persistDir: string, profile: ProfileReport): Promise<ProfileReport> {
    const existing = await readJsonArtifact(
        path.join(persistDir, PERSIST_PROFILE_FILE),
        ProfileReportSchema,
    );
    const merged = mergeProfiles(existing, profile);
    await writeFile(
        path.join(persistDir, PERSIST_PROFILE_FILE),
        `${JSON.stringify(merged, null, JSON_PRETTY_INDENT)}\n`,
        "utf8",
    );
    return merged;
}
