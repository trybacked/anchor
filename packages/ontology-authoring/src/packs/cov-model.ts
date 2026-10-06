import type { Entity, Relation, SemanticModel } from "@trybacked/core";

export const COV_ONTOLOGY_URI = "https://w3id.org/italia/onto/COV" as const;

function manualProvenance(table: string, column: string, evidence: string) {
  return { table, column, evidence };
}

function profileProperties(table: string) {
  return [
    {
      name: "Identificativo normalizzato",
      columnName: "normalized_name",
      semanticType: "identifier" as const,
      role: "primary_key" as const,
      nullable: false,
      confidence: 0.95,
      provenance: manualProvenance(table, "normalized_name", "Chiave di deduplicazione"),
      semantics: {
        description:
          "Identificativo normalizzato (allineato a cov:hasAlternativeIdentifier via profilo documentale).",
        labels: { it: "identificativo normalizzato" },
      },
    },
    {
      name: "Denominazione",
      columnName: "name",
      semanticType: "text" as const,
      role: "attribute" as const,
      nullable: false,
      confidence: 0.9,
      provenance: manualProvenance(table, "name", "Denominazione estratta"),
      semantics: {
        description: "Denominazione o nome legale (cov:legalName / rdfs:label).",
        labels: { it: "denominazione" },
      },
    },
    {
      name: "Tipo entità estratta",
      columnName: "entity_type",
      semanticType: "category" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 0.85,
      provenance: manualProvenance(table, "entity_type", "Tipo assegnato in estrazione NER"),
    },
    {
      name: "Menioni",
      columnName: "mention_count",
      semanticType: "number" as const,
      role: "attribute" as const,
      nullable: false,
      confidence: 0.9,
      provenance: manualProvenance(table, "mention_count", "Conteggio menzioni nel corpus"),
    },
    {
      name: "Primo documento",
      columnName: "first_seen_document_id",
      semanticType: "identifier" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 0.85,
      provenance: manualProvenance(table, "first_seen_document_id", "Provenienza documentale"),
    },
    {
      name: "Ultimo documento",
      columnName: "last_seen_document_id",
      semanticType: "identifier" as const,
      role: "attribute" as const,
      nullable: true,
      confidence: 0.85,
      provenance: manualProvenance(table, "last_seen_document_id", "Provenienza documentale"),
    },
  ];
}

function covProfileEntity(options: {
  id: string;
  name: string;
  nameIt: { singular: string; plural: string };
  covClass: string;
  tableSuffix: string;
  description: string;
  catalog: string;
}): Entity {
  const table = `${options.catalog}.docs.${options.tableSuffix}`;
  return {
    id: options.id,
    name: options.name,
    description: `${options.description} Classe COV: ${options.covClass}.`,
    sourceTable: table,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table, evidence: `Vista materializzata allineata a ${options.covClass}` },
    semantics: {
      labels: { it: options.nameIt },
      synonyms: [options.covClass.split("/").pop() ?? options.id],
      displayProperties: ["name", "mention_count"],
    },
    properties: profileProperties(table),
  };
}

function personEntity(catalog: string): Entity {
  const table = `${catalog}.docs.person_profiles`;
  return {
    id: "person",
    name: "Person",
    description:
      "Persona fisica citata nei documenti (estensione operativa accanto a COV-AP_IT). Classe di riferimento: https://w3id.org/italia/onto/CPV/Person.",
    sourceTable: table,
    status: "confirmed",
    confidence: 0.9,
    provenance: { table, evidence: "Profili persona materializzati da entity_profiles" },
    semantics: {
      labels: { it: { singular: "persona", plural: "persone" } },
      displayProperties: ["name", "mention_count"],
      synonyms: ["persone", "persona fisica"],
    },
    properties: profileProperties(table),
  };
}

function affiliationEntity(catalog: string): Entity {
  const table = `${catalog}.docs.person_organization_affiliations`;
  return {
    id: "person_organization_affiliation",
    name: "Person organization affiliation",
    description:
      "Associazione persona–organizzazione dedotta da co-occorrenza negli stessi documenti (ruolo/affiliazione COV).",
    sourceTable: table,
    status: "confirmed",
    confidence: 0.85,
    provenance: { table, evidence: "Vista person_organization_affiliations" },
    semantics: {
      labels: {
        it: { singular: "affiliazione persona-organizzazione", plural: "affiliazioni persona-organizzazione" },
      },
    },
    properties: [
      {
        name: "Affiliation id",
        columnName: "affiliation_id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: manualProvenance(table, "affiliation_id", "Surrogate key"),
      },
      {
        name: "Person normalized name",
        columnName: "person_normalized_name",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "person_normalized_name", "FK verso person"),
      },
      {
        name: "Organization normalized name",
        columnName: "organization_normalized_name",
        semanticType: "identifier",
        role: "foreign_key",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "organization_normalized_name", "FK verso organization"),
      },
      {
        name: "Co-document count",
        columnName: "co_document_count",
        semanticType: "number",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: manualProvenance(table, "co_document_count", "Documenti condivisi"),
      },
    ],
  };
}

function affiliationRelations(catalog: string): Relation[] {
  const table = `${catalog}.docs.person_organization_affiliations`;
  return [
    {
      id: "affiliation_has_person",
      name: "Affiliation has person",
      fromEntity: "person_organization_affiliation",
      toEntity: "person",
      fromColumn: "person_normalized_name",
      toColumn: "normalized_name",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 0.9,
      provenance: manualProvenance(table, "person_normalized_name", "Join su normalized_name"),
    },
    {
      id: "affiliation_has_organization",
      name: "Affiliation has organization",
      fromEntity: "person_organization_affiliation",
      toEntity: "organization",
      fromColumn: "organization_normalized_name",
      toColumn: "normalized_name",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 0.9,
      provenance: manualProvenance(table, "organization_normalized_name", "Join su normalized_name"),
    },
  ];
}

/** Canonical COV-AP_IT + Person semantic model for a tenant catalog. */
export function buildCovSemanticModel(
  catalog: string,
  metadata: { runId: string; generatedAt: string },
): SemanticModel {
  const cov = COV_ONTOLOGY_URI;
  return {
    metadata: {
      formatVersion: "1",
      runId: metadata.runId,
      generatedAt: metadata.generatedAt,
    },
    semantics: {
      glossary: [
        {
          id: "cov-ap-it",
          term: "COV-AP_IT",
          definition:
            "Ontologia delle Organizzazioni (pubbliche e private) — profilo applicativo italiano AgID, v0.12. https://w3id.org/italia/onto/COV",
        },
        {
          id: "cov-organization",
          term: "Organizzazione",
          definition: "Classe radice COV per organizzazioni pubbliche e private.",
          objectId: "organization",
        },
        {
          id: "cov-person",
          term: "Persona",
          definition: "Persone fisiche citate nel corpus documentale del tenant.",
          objectId: "person",
        },
      ],
      examples: [],
    },
    entities: [
      covProfileEntity({
        id: "organization",
        name: "Organization",
        nameIt: { singular: "organizzazione", plural: "organizzazioni" },
        covClass: `${cov}/Organization`,
        tableSuffix: "organization_profiles",
        description: "Organizzazione pubblica o privata registrata o citata nei documenti.",
        catalog,
      }),
      covProfileEntity({
        id: "public_organization",
        name: "Public organization",
        nameIt: { singular: "amministrazione pubblica", plural: "amministrazioni pubbliche" },
        covClass: `${cov}/PublicOrganization`,
        tableSuffix: "public_organization_profiles",
        description: "Organizzazione pubblica (PA, enti, amministrazioni).",
        catalog,
      }),
      covProfileEntity({
        id: "private_organization",
        name: "Private organization",
        nameIt: { singular: "organizzazione privata", plural: "organizzazioni private" },
        covClass: `${cov}/PrivateOrganization`,
        tableSuffix: "private_organization_profiles",
        description: "Organizzazione privata o impresa.",
        catalog,
      }),
      covProfileEntity({
        id: "support_unit",
        name: "Support unit",
        nameIt: { singular: "unità di supporto", plural: "unità di supporto" },
        covClass: `${cov}/SupportUnit`,
        tableSuffix: "support_unit_profiles",
        description: "Unità organizzativa di supporto (ufficio, servizio, settore).",
        catalog,
      }),
      personEntity(catalog),
      affiliationEntity(catalog),
    ],
    relations: affiliationRelations(catalog),
    rules: [],
  };
}
