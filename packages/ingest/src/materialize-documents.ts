import { collectDocumentFieldKeys, DOCUMENT_INFRASTRUCTURE_COLUMNS, documentTypeTableName } from "@backed/core";
import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeSummary } from "@backed/core";
import { DOCUMENT_LINES_TABLE } from "@backed/core";
import { DOCUMENT_HEADER_LINE_LIMIT, DOCUMENT_TYPE_SAMPLE_TABLE_LIMIT, CORPUS_SAMPLE_LINE_LIMIT, } from "./constants.js";
import { readRowNumber, readRowString } from "./duckdb-row.js";
import { dropTableIfExists, quoteIdentifier, quoteString, sqlNullableString } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";

export async function fetchDocumentHeaderText(
    query: SqlQuery,
    tableName: string,
    lineLimit = DOCUMENT_HEADER_LINE_LIMIT,
): Promise<string[]> {
    const rows = await query(`SELECT text FROM ${quoteIdentifier(tableName)} WHERE page = 1 ORDER BY line LIMIT ${String(lineLimit)}`);
    return rows.map((row) => readRowString(row, "text"));
}
export async function fetchCorpusSampleLines(
    query: SqlQuery,
    tableNames: string[],
    lineLimit = CORPUS_SAMPLE_LINE_LIMIT,
): Promise<Array<{
    document_id: string;
    page: number;
    line: number;
    text: string;
}>> {
    const sample: Array<{
        document_id: string;
        page: number;
        line: number;
        text: string;
    }> = [];
    for (const tableName of tableNames) {
        const rows = await query(`SELECT page, line, text FROM ${quoteIdentifier(tableName)}
       ORDER BY page, line LIMIT ${String(lineLimit)}`);
        for (const row of rows) {
            sample.push({
                document_id: tableName,
                page: readRowNumber(row, "page"),
                line: readRowNumber(row, "line"),
                text: readRowString(row, "text"),
            });
        }
    }
    return sample;
}
export interface DocumentHeaderSample {
    sourceTable: string;
    headerLines: string[];
    pageCount: number;
}
export async function fetchDocumentHeaderSamples(query: SqlQuery, entries: Array<{
    sourceTable: string;
    pageCount: number;
}>): Promise<DocumentHeaderSample[]> {
    const samples: DocumentHeaderSample[] = [];
    for (const entry of entries) {
        const headerLines = await fetchDocumentHeaderText(query, entry.sourceTable);
        samples.push({
            sourceTable: entry.sourceTable,
            headerLines,
            pageCount: entry.pageCount,
        });
    }
    return samples;
}
export interface MaterializeDocumentsResult {
    catalog: DocumentCatalog;
    datasetsAdded: Dataset[];
    datasetsRemoved: string[];
}
function buildDocumentTypes(documents: DocumentCatalogEntry[]): DocumentTypeSummary[] {
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
            sampleSourceTables: entries.slice(0, DOCUMENT_TYPE_SAMPLE_TABLE_LIMIT).map((entry) => entry.sourceTable),
        };
    });
}
async function createDocumentLinesTable(query: SqlQuery, sourceTables: string[]): Promise<void> {
    await dropTableIfExists(query, DOCUMENT_LINES_TABLE);
    if (sourceTables.length === 0) {
        await query(`CREATE TABLE ${quoteIdentifier(DOCUMENT_LINES_TABLE)} (
        document_id VARCHAR NOT NULL,
        page INTEGER NOT NULL,
        line INTEGER NOT NULL,
        text VARCHAR NOT NULL
      )`);
        return;
    }
    const unions = sourceTables.map((tableName) => `SELECT ${quoteString(tableName)} AS document_id, page, line, text FROM ${quoteIdentifier(tableName)}`);
    await query(`CREATE TABLE ${quoteIdentifier(DOCUMENT_LINES_TABLE)} AS ${unions.join(" UNION ALL ")}`);
}

function infrastructureColumnDefinitions(): string[] {
    return [
        "document_id VARCHAR NOT NULL",
        "source_file VARCHAR",
        "page_count INTEGER NOT NULL",
    ];
}

async function createTypedDocumentTable(
    query: SqlQuery,
    tableName: string,
    documents: DocumentCatalogEntry[],
): Promise<void> {
    await dropTableIfExists(query, tableName);
    const fieldKeys = collectDocumentFieldKeys(documents);
    const columnDefinitions = [
        ...infrastructureColumnDefinitions(),
        ...fieldKeys.map((key) => `${quoteIdentifier(key)} VARCHAR`),
    ];
    await query(`CREATE TABLE ${quoteIdentifier(tableName)} (${columnDefinitions.join(", ")})`);
    for (const document of documents) {
        const columns = [...DOCUMENT_INFRASTRUCTURE_COLUMNS, ...fieldKeys];
        const values = [
            quoteString(document.sourceTable),
            sqlNullableString(document.sourceFile ?? null),
            String(document.pageCount),
            ...fieldKeys.map((key) => sqlNullableString(document.fields[key]?.value ?? null)),
        ];
        await query(`INSERT INTO ${quoteIdentifier(tableName)} (${columns.map((column) => quoteIdentifier(column)).join(", ")})
      VALUES (${values.join(", ")})`);
    }
}

export async function materializeDocumentTables(query: SqlQuery, catalog: Omit<DocumentCatalog, "documentTypes">, sourceFileByTable: Map<string, string>): Promise<MaterializeDocumentsResult> {
    const documents = catalog.documents.map((document) => ({
        ...document,
        ...(document.sourceFile === undefined && sourceFileByTable.has(document.sourceTable)
            ? { sourceFile: sourceFileByTable.get(document.sourceTable) }
            : {}),
    }));
    const documentTypes = buildDocumentTypes(documents);
    const sourceTables = documents.map((document) => document.sourceTable);
    for (const type of documentTypes) {
        const typedDocuments = documents.filter((document) => document.documentType === type.id);
        await createTypedDocumentTable(query, type.tableName, typedDocuments);
    }
    await createDocumentLinesTable(query, sourceTables);
    for (const sourceTable of sourceTables) {
        await dropTableIfExists(query, sourceTable);
    }
    const datasetsAdded: Dataset[] = [
        ...documentTypes.map((type) => ({
            tableName: type.tableName,
            sourceFile: `document-catalog:${type.id}`,
            format: "json" as const,
        })),
        {
            tableName: DOCUMENT_LINES_TABLE,
            sourceFile: "document-catalog:lines",
            format: "json" as const,
        },
    ];
    return {
        catalog: {
            ...catalog,
            documents,
            documentTypes,
        },
        datasetsAdded,
        datasetsRemoved: sourceTables,
    };
}
