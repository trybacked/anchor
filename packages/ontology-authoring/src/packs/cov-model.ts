import type { Entity, Relation, SemanticModel } from "@trybacked/core";

function columnProvenance(table: string, column: string, evidence: string) {
  return { table, column, evidence };
}

/** Shared profile shape backed by docs.*_profiles tables (Foundry object type). */
function profileObjectProperties(table: string) {
  return [
    {
      name: "Normalized name",
      columnName: "normalized_name",
      semanticType: "identifier" as const,
      role: "primary_key" as const,
      nullable: false,
      confidence: 1,
      provenance: columnProvenance(table, "normalized_name", "Primary key for deduplicated entity"),
    },
    {
      name: "Name",
      columnName: "name",
      semanticType: "text" as const,
      role: "attribute" as const,
      nullable: false,
      confidence: 1,
      provenance: columnProvenance(table, "name", "Display title for object instances"),
    },
    {
      name: "Entity type",
      columnName: "entity_type",
      semanticType: "category" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 1,
      provenance: columnProvenance(table, "entity_type", "NER entity type from extraction"),
    },
    {
      name: "Mention count",
      columnName: "mention_count",
      semanticType: "number" as const,
      role: "attribute" as const,
      nullable: false,
      confidence: 1,
      provenance: columnProvenance(table, "mention_count", "Corpus mention count"),
    },
    {
      name: "First seen document id",
      columnName: "first_seen_document_id",
      semanticType: "identifier" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 1,
      provenance: columnProvenance(table, "first_seen_document_id", "First document id"),
    },
    {
      name: "Last seen document id",
      columnName: "last_seen_document_id",
      semanticType: "identifier" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 1,
      provenance: columnProvenance(table, "last_seen_document_id", "Last document id"),
    },
  ];
}

function profileObjectType(options: {
  id: string;
  name: string;
  tableSuffix: string;
  description: string;
  catalog: string;
}): Entity {
  const table = `${options.catalog}.docs.${options.tableSuffix}`;
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    sourceTable: table,
    status: "confirmed",
    confidence: 1,
    provenance: { table, evidence: "Materialized profile view" },
    semantics: {
      displayProperties: ["name"],
    },
    properties: profileObjectProperties(table),
  };
}

function personObjectType(catalog: string): Entity {
  return profileObjectType({
    id: "person",
    name: "Person",
    tableSuffix: "person_profiles",
    description: "Natural person referenced in the document corpus.",
    catalog,
  });
}

function affiliationObjectType(catalog: string): Entity {
  const table = `${catalog}.docs.person_organization_affiliations`;
  return {
    id: "person_organization_affiliation",
    name: "Person organization affiliation",
    description: "Link object between a person and an organization from co-occurrence in documents.",
    sourceTable: table,
    status: "confirmed",
    confidence: 1,
    provenance: { table, evidence: "person_organization_affiliations view" },
    properties: [
      {
        name: "Affiliation id",
        columnName: "affiliation_id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 1,
        provenance: columnProvenance(table, "affiliation_id", "Surrogate primary key"),
      },
      {
        name: "Person normalized name",
        columnName: "person_normalized_name",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 1,
        provenance: columnProvenance(table, "person_normalized_name", "Foreign key to person"),
      },
      {
        name: "Organization normalized name",
        columnName: "organization_normalized_name",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 1,
        provenance: columnProvenance(
          table,
          "organization_normalized_name",
          "Foreign key to organization",
        ),
      },
      {
        name: "Co document count",
        columnName: "co_document_count",
        semanticType: "number",
        role: "attribute",
        nullable: false,
        confidence: 1,
        provenance: columnProvenance(table, "co_document_count", "Shared document count"),
      },
    ],
  };
}

function affiliationLinkTypes(catalog: string): Relation[] {
  const table = `${catalog}.docs.person_organization_affiliations`;
  return [
    {
      id: "affiliation_to_person",
      name: "Person",
      fromEntity: "person_organization_affiliation",
      toEntity: "person",
      fromColumn: "person_normalized_name",
      toColumn: "normalized_name",
      cardinality: "many_to_many",
      status: "confirmed",
      confidence: 1,
      provenance: columnProvenance(table, "person_normalized_name", "Join to person"),
    },
    {
      id: "affiliation_to_organization",
      name: "Organization",
      fromEntity: "person_organization_affiliation",
      toEntity: "organization",
      fromColumn: "organization_normalized_name",
      toColumn: "normalized_name",
      cardinality: "many_to_many",
      status: "confirmed",
      confidence: 1,
      provenance: columnProvenance(
        table,
        "organization_normalized_name",
        "Join to organization",
      ),
    },
  ];
}

/** Foundry-style document ontology (object types + link types) for a tenant catalog. */
export function buildCovSemanticModel(
  catalog: string,
  metadata: { runId: string; generatedAt: string },
): SemanticModel {
  return {
    metadata: {
      formatVersion: "1",
      runId: metadata.runId,
      generatedAt: metadata.generatedAt,
    },
    entities: [
      profileObjectType({
        id: "organization",
        name: "Organization",
        tableSuffix: "organization_profiles",
        description: "Public or private organization referenced in documents.",
        catalog,
      }),
      profileObjectType({
        id: "public_organization",
        name: "Public organization",
        tableSuffix: "public_organization_profiles",
        description: "Public-sector organization.",
        catalog,
      }),
      profileObjectType({
        id: "private_organization",
        name: "Private organization",
        tableSuffix: "private_organization_profiles",
        description: "Private-sector organization.",
        catalog,
      }),
      profileObjectType({
        id: "support_unit",
        name: "Support unit",
        tableSuffix: "support_unit_profiles",
        description: "Organizational support unit or office.",
        catalog,
      }),
      personObjectType(catalog),
      affiliationObjectType(catalog),
    ],
    relations: affiliationLinkTypes(catalog),
    rules: [],
  };
}

/** @deprecated Use buildCovSemanticModel — kept for imports expecting COV URI constant. */
export const COV_ONTOLOGY_URI = "https://w3id.org/italia/onto/COV" as const;

export const buildFoundryDocumentOntology = buildCovSemanticModel;
