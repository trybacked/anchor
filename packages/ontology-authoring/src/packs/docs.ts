import type { AuthoringCommand, Entity, Relation } from "@trybacked/core";

function manualProvenance(table: string, column: string, evidence: string) {
  return {
    table,
    column,
    evidence,
  };
}

function documentEntity(catalog: string): Entity {
  const table = `${catalog}.docs.documents`;
  return {
    id: "document",
    name: "Document",
    sourceTable: table,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table, evidence: "Docs archive documents table" },
    properties: [
      {
        name: "Document id",
        columnName: "document_id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: manualProvenance(table, "document_id", "Primary key"),
      },
      {
        name: "Filename",
        columnName: "filename",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "filename", "Filename"),
      },
      {
        name: "Path",
        columnName: "path",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "path", "Storage path"),
      },
    ],
  };
}

function documentElementEntity(catalog: string): Entity {
  const table = `${catalog}.docs.document_elements`;
  return {
    id: "document_element",
    name: "Document element",
    sourceTable: table,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table, evidence: "Parsed document elements" },
    properties: [
      {
        name: "Element id",
        columnName: "element_id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: manualProvenance(table, "element_id", "Primary key"),
      },
      {
        name: "Document id",
        columnName: "document_id",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "document_id", "FK to document"),
      },
      {
        name: "Content",
        columnName: "content",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "content", "Element text"),
      },
    ],
  };
}

function personEntity(catalog: string): Entity {
  const table = `${catalog}.docs.person_profiles`;
  return {
    id: "person",
    name: "Person",
    description: "Persone estratte dal corpus documentale",
    sourceTable: table,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table, evidence: "Person profiles materialized view" },
    properties: [
      {
        name: "Normalized name",
        columnName: "normalized_name",
        semanticType: "text",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: manualProvenance(table, "normalized_name", "Dedup key"),
      },
      {
        name: "Name",
        columnName: "name",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "name", "Display name"),
      },
      {
        name: "Mention count",
        columnName: "mention_count",
        semanticType: "number",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "mention_count", "Mention count"),
      },
    ],
  };
}

const documentHasElements = (catalog: string): Relation => ({
  id: "document_has_elements",
  name: "Document has elements",
  fromEntity: "document",
  toEntity: "document_element",
  fromColumn: "document_id",
  toColumn: "document_id",
  cardinality: "one_to_many",
  status: "confirmed",
  confidence: 0.95,
  provenance: {
    table: `${catalog}.docs.document_elements`,
    column: "document_id",
    evidence: "document_id join",
  },
});

export function docsPackCommands(catalog: string): AuthoringCommand[] {
  return [
    { type: "addEntity", entity: documentEntity(catalog) },
    { type: "addEntity", entity: documentElementEntity(catalog) },
    { type: "addEntity", entity: personEntity(catalog) },
    { type: "addRelation", relation: documentHasElements(catalog) },
  ];
}
