/**
 * Deterministic ontology for materialized document corpora: one entity per
 * document type, plus Document Text linked by document_id.
 */

import {
  DOCUMENT_CHUNKS_TABLE,
  DOCUMENT_LINES_TABLE,
  documentTypeTableName,
} from "@backed/core";
import type {
  DocumentCatalog,
  Entity,
  ProfileReport,
  Relation,
} from "@backed/core";

import type { ColumnClassificationOutput } from "./llm-output.js";

const TYPED_DOCUMENT_COLUMNS = [
  {
    column: "document_id",
    label: "Document ID",
    semanticType: "identifier" as const,
    role: "primary_key" as const,
  },
  {
    column: "source_file",
    label: "Source file",
    semanticType: "text" as const,
    role: "attribute" as const,
  },
  {
    column: "protocol_number",
    label: "Protocol number",
    semanticType: "identifier" as const,
    role: "attribute" as const,
  },
  {
    column: "published_date",
    label: "Published date",
    semanticType: "date" as const,
    role: "attribute" as const,
  },
  {
    column: "subject",
    label: "Subject",
    semanticType: "text" as const,
    role: "attribute" as const,
  },
  {
    column: "issuing_office",
    label: "Issuing office",
    semanticType: "text" as const,
    role: "attribute" as const,
  },
  {
    column: "page_count",
    label: "Page count",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
];

const DOCUMENT_LINES_COLUMNS = [
  {
    column: "document_id",
    label: "Document ID",
    semanticType: "identifier" as const,
    role: "foreign_key" as const,
  },
  {
    column: "page",
    label: "Page number",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
  {
    column: "line",
    label: "Line number",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
  {
    column: "text",
    label: "Text content",
    semanticType: "text" as const,
    role: "attribute" as const,
  },
];

export const DOCUMENT_TEXT_ENTITY_ID = "document_text";
export const DOCUMENT_CHUNK_ENTITY_ID = "document_chunk";

const DOCUMENT_CHUNK_COLUMNS = [
  {
    column: "document_id",
    label: "Document ID",
    semanticType: "identifier" as const,
    role: "foreign_key" as const,
  },
  {
    column: "chunk_index",
    label: "Chunk index",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
  {
    column: "page_start",
    label: "Start page",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
  {
    column: "page_end",
    label: "End page",
    semanticType: "number" as const,
    role: "attribute" as const,
  },
  {
    column: "text",
    label: "Chunk text",
    semanticType: "text" as const,
    role: "attribute" as const,
  },
];

function slugToEntityId(typeId: string): string {
  return typeId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function classifyTypedDocumentTables(
  catalog: DocumentCatalog,
): ColumnClassificationOutput {
  return {
    tables: [
      ...catalog.documentTypes.map((type) => ({
        table: type.tableName,
        columns: TYPED_DOCUMENT_COLUMNS.map((column) => ({
          ...column,
          confidence: type.confidence,
        })),
      })),
      {
        table: DOCUMENT_LINES_TABLE,
        columns: DOCUMENT_LINES_COLUMNS.map((column) => ({
          ...column,
          confidence: 0.95,
        })),
      },
      {
        table: DOCUMENT_CHUNKS_TABLE,
        columns: DOCUMENT_CHUNK_COLUMNS.map((column) => ({
          ...column,
          confidence: 0.95,
        })),
      },
    ],
  };
}

function buildTypedEntity(
  catalog: DocumentCatalog,
  type: DocumentCatalog["documentTypes"][number],
  profile: ProfileReport,
): Entity {
  const table = profile.find((entry) => entry.table === type.tableName);
  const entityId = slugToEntityId(type.id);

  return {
    id: entityId,
    name: type.name,
    description: `Official ${type.name.toLowerCase()} documents extracted from source files`,
    sourceTable: type.tableName,
    status: "proposed",
    confidence: type.confidence,
    provenance: {
      table: type.tableName,
      evidence: `${String(type.documentCount)} documents classified as "${type.name}" from header extraction (examples: ${type.sampleSourceTables.join(", ")})`,
    },
    properties: TYPED_DOCUMENT_COLUMNS.map((columnDef) => {
      const column = table?.columns.find((entry) => entry.name === columnDef.column);
      return {
        name: columnDef.label,
        columnName: columnDef.column,
        semanticType: columnDef.semanticType,
        role: columnDef.role,
        nullable: column?.nullCount ? column.nullCount > 0 : columnDef.column !== "document_id",
        confidence: type.confidence,
        provenance: {
          table: type.tableName,
          column: columnDef.column,
          evidence: column
            ? `${columnDef.label} column (${column.sqlType}) on ${String(type.documentCount)} rows`
            : `${columnDef.label} on materialized document type table`,
        },
      };
    }),
  };
}

function buildDocumentTextEntity(profile: ProfileReport): Entity {
  const table = profile.find((entry) => entry.table === DOCUMENT_LINES_TABLE);

  return {
    id: DOCUMENT_TEXT_ENTITY_ID,
    name: "Document Text",
    description: "Line-level text content for all documents in the corpus",
    sourceTable: DOCUMENT_LINES_TABLE,
    status: "proposed",
    confidence: 0.95,
    provenance: {
      table: DOCUMENT_LINES_TABLE,
      evidence: `Unified line table with ${String(table?.rowCount ?? 0)} rows across the document corpus`,
    },
    properties: DOCUMENT_LINES_COLUMNS.map((columnDef) => {
      const column = table?.columns.find((entry) => entry.name === columnDef.column);
      return {
        name: columnDef.label,
        columnName: columnDef.column,
        semanticType: columnDef.semanticType,
        role: columnDef.role,
        nullable: column?.nullCount ? column.nullCount > 0 : false,
        confidence: 0.95,
        provenance: {
          table: DOCUMENT_LINES_TABLE,
          column: columnDef.column,
          evidence: column
            ? `${columnDef.label} column (${column.sqlType})`
            : `${columnDef.label} on unified document line table`,
        },
      };
    }),
  };
}

function buildDocumentChunkEntity(profile: ProfileReport): Entity {
  const table = profile.find((entry) => entry.table === DOCUMENT_CHUNKS_TABLE);

  return {
    id: DOCUMENT_CHUNK_ENTITY_ID,
    name: "Document Chunk",
    description: "Searchable text segments from documents, split for semantic retrieval",
    sourceTable: DOCUMENT_CHUNKS_TABLE,
    status: "proposed",
    confidence: 0.95,
    provenance: {
      table: DOCUMENT_CHUNKS_TABLE,
      evidence: `Chunk table with ${String(table?.rowCount ?? 0)} searchable segments across the document corpus`,
    },
    properties: DOCUMENT_CHUNK_COLUMNS.map((columnDef) => {
      const column = table?.columns.find((entry) => entry.name === columnDef.column);
      return {
        name: columnDef.label,
        columnName: columnDef.column,
        semanticType: columnDef.semanticType,
        role: columnDef.role,
        nullable: column?.nullCount ? column.nullCount > 0 : false,
        confidence: 0.95,
        provenance: {
          table: DOCUMENT_CHUNKS_TABLE,
          column: columnDef.column,
          evidence: column
            ? `${columnDef.label} column (${column.sqlType})`
            : `${columnDef.label} on document chunk table`,
        },
      };
    }),
  };
}

export function buildDocumentCorpusEntities(
  catalog: DocumentCatalog,
  profile: ProfileReport,
): Entity[] {
  return [
    ...catalog.documentTypes.map((type) => buildTypedEntity(catalog, type, profile)),
    buildDocumentTextEntity(profile),
    buildDocumentChunkEntity(profile),
  ];
}

export function buildDocumentCorpusRelations(
  catalog: DocumentCatalog,
  entities: Entity[],
): Relation[] {
  const documentText = entities.find((entity) => entity.id === DOCUMENT_TEXT_ENTITY_ID);
  const documentChunk = entities.find((entity) => entity.id === DOCUMENT_CHUNK_ENTITY_ID);
  if (!documentText || !documentChunk) {
    return [];
  }

  const typeRelations = catalog.documentTypes.flatMap((type) => {
    const entityId = slugToEntityId(type.id);
    return [
      {
        id: `${entityId}_has_text`,
        name: `${type.name} has document text`,
        fromEntity: entityId,
        toEntity: DOCUMENT_TEXT_ENTITY_ID,
        fromColumn: "document_id",
        toColumn: "document_id",
        cardinality: "one_to_many" as const,
        status: "proposed" as const,
        confidence: type.confidence,
        provenance: {
          table: type.tableName,
          column: "document_id",
          evidence: `Each ${type.name.toLowerCase()} row links to line-level text rows via document_id`,
        },
      },
      {
        id: `${entityId}_has_chunks`,
        name: `${type.name} has document chunks`,
        fromEntity: entityId,
        toEntity: DOCUMENT_CHUNK_ENTITY_ID,
        fromColumn: "document_id",
        toColumn: "document_id",
        cardinality: "one_to_many" as const,
        status: "proposed" as const,
        confidence: type.confidence,
        provenance: {
          table: type.tableName,
          column: "document_id",
          evidence: `Each ${type.name.toLowerCase()} row links to searchable text chunks via document_id`,
        },
      },
    ];
  });

  return typeRelations;
}

export function isMaterializedDocumentTable(tableName: string, catalog: DocumentCatalog): boolean {
  if (tableName === DOCUMENT_LINES_TABLE || tableName === DOCUMENT_CHUNKS_TABLE) {
    return true;
  }
  return catalog.documentTypes.some((type) => type.tableName === tableName);
}

export function resolveDocumentTypeTableName(typeId: string): string {
  return documentTypeTableName(typeId);
}
