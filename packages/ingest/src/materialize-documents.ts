import { DOCUMENT_LINES_TABLE, documentTypeTableName } from "@backed/core";
import type { DocumentCatalog, DocumentCatalogEntry, DocumentTypeSummary } from "@backed/core";

import { quoteIdentifier, quoteString } from "./sql.js";
import type { Dataset, SqlQuery } from "./types.js";

export const DOCUMENT_HEADER_LINE_LIMIT = 20;

export async function fetchDocumentHeaderText(
  query: SqlQuery,
  tableName: string,
  lineLimit = DOCUMENT_HEADER_LINE_LIMIT,
): Promise<string[]> {
  const rows = await query(
    `SELECT text FROM ${quoteIdentifier(tableName)} WHERE page = 1 ORDER BY line LIMIT ${String(lineLimit)}`,
  );
  return rows.map((row) => String(row["text"] ?? ""));
}

export interface DocumentHeaderSample {
  sourceTable: string;
  headerLines: string[];
  pageCount: number;
}

export async function fetchDocumentHeaderSamples(
  query: SqlQuery,
  entries: Array<{ sourceTable: string; pageCount: number }>,
): Promise<DocumentHeaderSample[]> {
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

function nullableString(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") {
    return "NULL";
  }
  return quoteString(value);
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
      sampleSourceTables: entries.slice(0, 3).map((entry) => entry.sourceTable),
    };
  });
}

async function dropTableIfExists(query: SqlQuery, tableName: string): Promise<void> {
  await query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}

async function createDocumentLinesTable(
  query: SqlQuery,
  sourceTables: string[],
): Promise<void> {
  await dropTableIfExists(query, DOCUMENT_LINES_TABLE);
  if (sourceTables.length === 0) {
    await query(
      `CREATE TABLE ${quoteIdentifier(DOCUMENT_LINES_TABLE)} (
        document_id VARCHAR NOT NULL,
        page INTEGER NOT NULL,
        line INTEGER NOT NULL,
        text VARCHAR NOT NULL
      )`,
    );
    return;
  }

  const unions = sourceTables.map(
    (tableName) =>
      `SELECT ${quoteString(tableName)} AS document_id, page, line, text FROM ${quoteIdentifier(tableName)}`,
  );
  await query(
    `CREATE TABLE ${quoteIdentifier(DOCUMENT_LINES_TABLE)} AS ${unions.join(" UNION ALL ")}`,
  );
}

async function createTypedDocumentTable(
  query: SqlQuery,
  tableName: string,
  documents: DocumentCatalogEntry[],
): Promise<void> {
  await dropTableIfExists(query, tableName);
  await query(
    `CREATE TABLE ${quoteIdentifier(tableName)} (
      document_id VARCHAR NOT NULL,
      source_file VARCHAR,
      protocol_number VARCHAR,
      published_date VARCHAR,
      subject VARCHAR,
      issuing_office VARCHAR,
      page_count INTEGER NOT NULL
    )`,
  );

  for (const document of documents) {
    const protocol = nullableString(document.protocolNumber?.value ?? null);
    const publishedDate = nullableString(document.publishedDate?.value ?? null);
    const subject = nullableString(document.subject?.value ?? null);
    const issuingOffice = nullableString(document.issuingOffice?.value ?? null);
    const sourceFile = nullableString(document.sourceFile ?? null);
    await query(
      `INSERT INTO ${quoteIdentifier(tableName)} (
        document_id, source_file, protocol_number, published_date, subject, issuing_office, page_count
      ) VALUES (
        ${quoteString(document.sourceTable)},
        ${sourceFile},
        ${protocol},
        ${publishedDate},
        ${subject},
        ${issuingOffice},
        ${String(document.pageCount)}
      )`,
    );
  }
}

export async function materializeDocumentTables(
  query: SqlQuery,
  catalog: Omit<DocumentCatalog, "documentTypes">,
  sourceFileByTable: Map<string, string>,
): Promise<MaterializeDocumentsResult> {
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
