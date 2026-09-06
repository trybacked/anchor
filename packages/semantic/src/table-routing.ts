/**
 * Single entry point for partitioning compressed profile tables into
 * deterministic vs LLM classification and ontology paths.
 */

import { DOCUMENT_CHUNKS_TABLE, DOCUMENT_LINES_TABLE } from "@backed/core";
import type { DocumentCatalog } from "@backed/core";

import type { CompressedTable } from "./compress.js";
import { partitionStructuredTables, splitTablesByKind } from "./line-document.js";

export interface TableRouting {
  /** Business tables sent to LLM column classification and ontology burst. */
  llmStructured: CompressedTable[];
  /** Materialized doc_* / document_lines / document_chunks (deterministic only). */
  materializedDocuments: CompressedTable[];
  /** Raw page/line/text tables before materialization. */
  lineDocuments: CompressedTable[];
  /** Scrape/catalog metadata (manifest, etc.). */
  pipelineMetadata: CompressedTable[];
  /** All structured business tables, including materialized documents. */
  businessStructured: CompressedTable[];
  /** All compressed tables (for full ontology prompt). */
  allTables: CompressedTable[];
  totalTableCount: number;
}

export function isDocumentPipelineTable(tableName: string): boolean {
  return (
    tableName.startsWith("doc_") ||
    tableName === DOCUMENT_LINES_TABLE ||
    tableName === DOCUMENT_CHUNKS_TABLE
  );
}

export function routeTables(
  tables: CompressedTable[],
  documentCatalog?: DocumentCatalog,
): TableRouting {
  const { lineDocuments, structured } = splitTablesByKind(tables);
  const { pipelineMetadata, business: businessStructured } = partitionStructuredTables(structured);

  if (documentCatalog === undefined) {
    return {
      llmStructured: businessStructured,
      materializedDocuments: [],
      lineDocuments,
      pipelineMetadata,
      businessStructured,
      allTables: tables,
      totalTableCount: tables.length,
    };
  }

  const llmStructured: CompressedTable[] = [];
  const materializedDocuments: CompressedTable[] = [];
  for (const table of businessStructured) {
    if (isDocumentPipelineTable(table.table)) {
      materializedDocuments.push(table);
    } else {
      llmStructured.push(table);
    }
  }

  return {
    llmStructured,
    materializedDocuments,
    lineDocuments,
    pipelineMetadata,
    businessStructured,
    allTables: tables,
    totalTableCount: tables.length,
  };
}

export function formatRoutingSummary(
  routing: TableRouting,
  documentCatalog?: DocumentCatalog,
): string {
  const parts: string[] = [];

  if (documentCatalog !== undefined) {
    parts.push(
      `Document corpus materialized: ${String(documentCatalog.documentTypes.length)} type(s), ${String(documentCatalog.documents.length)} document(s).`,
    );
  } else if (routing.lineDocuments.length > 0) {
    parts.push(
      `${String(routing.lineDocuments.length)} line-document table(s) — deterministic column classification (no LLM).`,
    );
  }

  if (routing.pipelineMetadata.length > 0) {
    parts.push(
      `${String(routing.pipelineMetadata.length)} pipeline metadata table(s) — deterministic classification (no LLM).`,
    );
  }

  if (documentCatalog !== undefined && routing.materializedDocuments.length > 0) {
    parts.push(
      `${String(routing.materializedDocuments.length)} materialized document table(s) — deterministic column classification (no LLM).`,
    );
  }

  if (routing.llmStructured.length > 0) {
    parts.push(
      `${String(routing.llmStructured.length)} structured table(s) — LLM column classification and ontology.`,
    );
  }

  return parts.join(" ");
}
