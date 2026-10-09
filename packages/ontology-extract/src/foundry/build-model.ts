import type { Entity, Property, Provenance, Relation, SemanticModel } from "@trybacked/core";
import { docsQualifiedTable } from "./spec.js";

function prov(table: string, evidence: string, column?: string): Provenance {
  return {
    table,
    evidence,
    method: "human",
    ...(column !== undefined ? { column } : {}),
  };
}

function profileProperties(table: string): Property[] {
  const columns: Array<{
    columnName: string;
    name: string;
    semanticType: Property["semanticType"];
    role: Property["role"];
    nullable: boolean;
    evidence: string;
  }> = [
    {
      columnName: "normalized_name",
      name: "Normalized name",
      semanticType: "identifier",
      role: "primary_key",
      nullable: false,
      evidence: "Primary key for deduplicated entity",
    },
    {
      columnName: "name",
      name: "Name",
      semanticType: "text",
      role: "attribute",
      nullable: false,
      evidence: "Display title",
    },
    {
      columnName: "entity_type",
      name: "Entity type",
      semanticType: "category",
      role: "attribute",
      nullable: true,
      evidence: "NER or extraction label",
    },
    {
      columnName: "mention_count",
      name: "Mention count",
      semanticType: "number",
      role: "attribute",
      nullable: false,
      evidence: "Corpus mention count",
    },
    {
      columnName: "first_seen_document_id",
      name: "First seen document id",
      semanticType: "identifier",
      role: "attribute",
      nullable: true,
      evidence: "First document id",
    },
    {
      columnName: "last_seen_document_id",
      name: "Last seen document id",
      semanticType: "identifier",
      role: "attribute",
      nullable: true,
      evidence: "Last document id",
    },
  ];
  return columns.map((column) => ({
    name: column.name,
    columnName: column.columnName,
    semanticType: column.semanticType,
    role: column.role,
    nullable: column.nullable,
    confidence: 1,
    provenance: prov(table, column.evidence, column.columnName),
  }));
}

function profileEntity(
  id: string,
  name: string,
  description: string,
  catalog: string,
  profileTable: string,
  evidence: string,
  confidence = 1,
): Entity {
  const table = docsQualifiedTable(catalog, profileTable);
  return {
    id,
    name,
    description,
    sourceTable: table,
    status: "confirmed",
    confidence,
    provenance: prov(table, evidence),
    properties: profileProperties(table),
    semantics: { displayProperties: ["name"] },
  };
}

function mentionEntity(
  id: string,
  name: string,
  catalog: string,
  mentionTable: string,
  targetColumn: string,
  targetLabel: string,
): Entity {
  const table = docsQualifiedTable(catalog, mentionTable);
  return {
    id,
    name,
    description: name,
    sourceTable: table,
    status: "confirmed",
    confidence: 1,
    provenance: prov(table, `Junction document ↔ ${targetLabel}`),
    properties: [
      {
        name: "Mention id",
        columnName: "mention_id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 1,
        provenance: prov(table, "Surrogate key", "mention_id"),
      },
      {
        name: "Document id",
        columnName: "document_id",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 1,
        provenance: prov(table, "FK to document", "document_id"),
      },
      {
        name: `${targetLabel} normalized name`,
        columnName: targetColumn,
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 1,
        provenance: prov(table, `FK to ${targetLabel}`, targetColumn),
      },
    ],
  };
}

function relation(
  id: string,
  name: string,
  fromEntity: string,
  toEntity: string,
  fromColumn: string,
  toColumn: string,
  table: string,
  evidence: string,
  cardinality: Relation["cardinality"],
): Relation {
  return {
    id,
    name,
    fromEntity,
    toEntity,
    fromColumn,
    toColumn,
    cardinality,
    status: "confirmed",
    confidence: 1,
    provenance: prov(table, evidence, fromColumn),
  };
}

export type BuildFoundryDocumentSemanticModelOptions = {
  catalog: string;
  runId: string;
  generatedAt: string;
  sourceDir?: string | undefined;
};

export function buildFoundryDocumentSemanticModel(
  options: BuildFoundryDocumentSemanticModelOptions,
): SemanticModel {
  const { catalog, runId, generatedAt } = options;
  const documents = docsQualifiedTable(catalog, "documents");

  const entities: Entity[] = [
    {
      id: "document",
      name: "Document",
      description: "PDF or file in the document archive.",
      sourceTable: documents,
      status: "confirmed",
      confidence: 1,
      provenance: prov(documents, "Document registry after ingestion (OBDA mapping target)."),
      properties: [
        {
          name: "Document id",
          columnName: "document_id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 1,
          provenance: prov(documents, "Stable document identifier", "document_id"),
        },
        {
          name: "Source file",
          columnName: "source_file",
          semanticType: "text",
          role: "attribute",
          nullable: false,
          confidence: 1,
          provenance: prov(documents, "Path or key in enrollment storage", "source_file"),
        },
        {
          name: "Title",
          columnName: "title",
          semanticType: "text",
          role: "attribute",
          nullable: true,
          confidence: 0.9,
          provenance: prov(documents, "Display title from metadata or first heading", "title"),
        },
      ],
      semantics: { displayProperties: ["title", "source_file"] },
    },
    profileEntity(
      "organization",
      "Organization",
      "International or military organization referenced in documents (instances such as NATO, UN).",
      catalog,
      "organization_profiles",
      "Deduplicated organization profiles from extraction pipeline.",
    ),
    profileEntity(
      "person",
      "Person",
      "Natural person referenced in the document corpus.",
      catalog,
      "person_profiles",
      "Deduplicated person profiles from extraction.",
    ),
    profileEntity(
      "legal_instrument",
      "Legal instrument",
      "Treaties, conventions, and international legal instruments cited in documents.",
      catalog,
      "legal_instrument_profiles",
      "Profile view for legal instruments.",
    ),
    profileEntity(
      "topic",
      "Topic",
      "Thematic subject of a document (not a Wikipedia object type).",
      catalog,
      "topic_profiles",
      "Thematic tags or classified subjects per document set.",
    ),
    profileEntity(
      "military_asset",
      "Military asset",
      "Named weapon system or platform when explicitly identified in text.",
      catalog,
      "military_asset_profiles",
      "Optional profiles for named platforms.",
      0.95,
    ),
    mentionEntity(
      "document_topic_mention",
      "Document topic mention",
      catalog,
      "document_topic_mentions",
      "topic_normalized_name",
      "topic",
    ),
    mentionEntity(
      "document_organization_mention",
      "Document organization mention",
      catalog,
      "document_organization_mentions",
      "organization_normalized_name",
      "organization",
    ),
    mentionEntity(
      "document_person_mention",
      "Document person mention",
      catalog,
      "document_person_mentions",
      "person_normalized_name",
      "person",
    ),
    mentionEntity(
      "document_legal_instrument_mention",
      "Document legal instrument mention",
      catalog,
      "document_legal_instrument_mentions",
      "legal_instrument_normalized_name",
      "legal instrument",
    ),
    {
      id: "person_organization_affiliation",
      name: "Person organization affiliation",
      description: "Co-occurrence link between a person and an organization in the corpus.",
      sourceTable: docsQualifiedTable(catalog, "person_organization_affiliations"),
      status: "confirmed",
      confidence: 1,
      provenance: prov(
        docsQualifiedTable(catalog, "person_organization_affiliations"),
        "person_organization_affiliations view",
      ),
      properties: [
        {
          name: "Affiliation id",
          columnName: "affiliation_id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 1,
          provenance: prov(
            docsQualifiedTable(catalog, "person_organization_affiliations"),
            "Surrogate primary key",
            "affiliation_id",
          ),
        },
        {
          name: "Person normalized name",
          columnName: "person_normalized_name",
          semanticType: "identifier",
          role: "foreign_key",
          nullable: false,
          confidence: 1,
          provenance: prov(
            docsQualifiedTable(catalog, "person_organization_affiliations"),
            "FK to person",
            "person_normalized_name",
          ),
        },
        {
          name: "Organization normalized name",
          columnName: "organization_normalized_name",
          semanticType: "identifier",
          role: "foreign_key",
          nullable: false,
          confidence: 1,
          provenance: prov(
            docsQualifiedTable(catalog, "person_organization_affiliations"),
            "FK to organization",
            "organization_normalized_name",
          ),
        },
        {
          name: "Co document count",
          columnName: "co_document_count",
          semanticType: "number",
          role: "attribute",
          nullable: false,
          confidence: 1,
          provenance: prov(
            docsQualifiedTable(catalog, "person_organization_affiliations"),
            "Shared document count",
            "co_document_count",
          ),
        },
      ],
    },
  ];

  const relations: Relation[] = [
    relation(
      "mention_topic_to_document",
      "Document",
      "document_topic_mention",
      "document",
      "document_id",
      "document_id",
      docsQualifiedTable(catalog, "document_topic_mentions"),
      "Join to document",
      "many_to_one",
    ),
    relation(
      "mention_topic_to_topic",
      "Topic",
      "document_topic_mention",
      "topic",
      "topic_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "document_topic_mentions"),
      "Join to topic",
      "many_to_one",
    ),
    relation(
      "mention_org_to_document",
      "Document",
      "document_organization_mention",
      "document",
      "document_id",
      "document_id",
      docsQualifiedTable(catalog, "document_organization_mentions"),
      "Join to document",
      "many_to_one",
    ),
    relation(
      "mention_org_to_organization",
      "Organization",
      "document_organization_mention",
      "organization",
      "organization_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "document_organization_mentions"),
      "Join to organization",
      "many_to_one",
    ),
    relation(
      "mention_person_to_document",
      "Document",
      "document_person_mention",
      "document",
      "document_id",
      "document_id",
      docsQualifiedTable(catalog, "document_person_mentions"),
      "Join to document",
      "many_to_one",
    ),
    relation(
      "mention_person_to_person",
      "Person",
      "document_person_mention",
      "person",
      "person_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "document_person_mentions"),
      "Join to person",
      "many_to_one",
    ),
    relation(
      "mention_legal_to_document",
      "Document",
      "document_legal_instrument_mention",
      "document",
      "document_id",
      "document_id",
      docsQualifiedTable(catalog, "document_legal_instrument_mentions"),
      "Join to document",
      "many_to_one",
    ),
    relation(
      "mention_legal_to_legal_instrument",
      "Legal instrument",
      "document_legal_instrument_mention",
      "legal_instrument",
      "legal_instrument_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "document_legal_instrument_mentions"),
      "Join to legal instrument",
      "many_to_one",
    ),
    relation(
      "affiliation_to_person",
      "Person",
      "person_organization_affiliation",
      "person",
      "person_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "person_organization_affiliations"),
      "Join to person",
      "many_to_many",
    ),
    relation(
      "affiliation_to_organization",
      "Organization",
      "person_organization_affiliation",
      "organization",
      "organization_normalized_name",
      "normalized_name",
      docsQualifiedTable(catalog, "person_organization_affiliations"),
      "Join to organization",
      "many_to_many",
    ),
  ];

  return {
    metadata: {
      formatVersion: "1",
      runId,
      generatedAt,
      ...(options.sourceDir !== undefined ? { sourceDir: options.sourceDir } : {}),
    },
    entities,
    relations,
    rules: [],
  };
}
