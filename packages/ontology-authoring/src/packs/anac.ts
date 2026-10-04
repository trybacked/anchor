import type { AuthoringCommand, Entity, Relation } from "@trybacked/core";

const ANAC_CONTRACTS = "backed.anac.contracts";
const ANAC_ORGS = "backed.anac.organizations";

function contractEntity(): Entity {
  return {
    id: "contract",
    name: "Contract",
    description:
      "National procurement contract row from shared ANAC enrollment (CIG-level).",
    sourceTable: ANAC_CONTRACTS,
    status: "confirmed",
    confidence: 0.85,
    provenance: { table: ANAC_CONTRACTS, evidence: "Shared ANAC contracts enrollment" },
    semantics: {
      displayProperties: [
        "cig",
        "oggetto_gara",
        "oggetto_lotto",
        "importo_lotto",
        "data_pubblicazione",
        "stato",
        "source_year_month",
      ],
      defaultTimeDimension: "source_year_month",
      synonyms: ["appalto", "contratto", "gara"],
    },
    properties: [
      {
        name: "Cig",
        columnName: "cig",
        semanticType: "text",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: { table: ANAC_CONTRACTS, column: "cig", evidence: "CIG primary key" },
        semantics: {
          semanticRole: "identifier",
          description: "Codice Identificativo Gara (CIG).",
        },
      },
      {
        name: "Source Year Month",
        columnName: "source_year_month",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: {
          table: ANAC_CONTRACTS,
          column: "source_year_month",
          evidence: "Ingest month partition",
        },
        semantics: {
          semanticRole: "partition",
          valueFormat: "YYYY-MM",
          description:
            "Warehouse ingest batch month (not publication date). Filter with eq or in.",
          synonyms: ["mese ingest", "mese di caricamento"],
        },
      },
      {
        name: "Cf Amministrazione Appaltante",
        columnName: "cf_amministrazione_appaltante",
        semanticType: "text",
        role: "attribute",
        nullable: true,
        confidence: 0.9,
        provenance: {
          table: ANAC_CONTRACTS,
          column: "cf_amministrazione_appaltante",
          evidence: "Organization fiscal code on contract",
        },
      },
    ],
  };
}

function organizationEntity(): Entity {
  return {
    id: "organization",
    name: "Organization",
    description: "Contracting authority (ente appaltante) from shared ANAC organizations.",
    sourceTable: ANAC_ORGS,
    status: "confirmed",
    confidence: 0.85,
    provenance: { table: ANAC_ORGS, evidence: "Shared ANAC organizations enrollment" },
    properties: [
      {
        name: "Cf Amministrazione Appaltante",
        columnName: "cf_amministrazione_appaltante",
        semanticType: "text",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: {
          table: ANAC_ORGS,
          column: "cf_amministrazione_appaltante",
          evidence: "Organization fiscal code",
        },
      },
      {
        name: "Denominazione Amministrazione Appaltante",
        columnName: "denominazione_amministrazione_appaltante",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: {
          table: ANAC_ORGS,
          column: "denominazione_amministrazione_appaltante",
          evidence: "Organization name",
        },
        semantics: {
          semanticRole: "label",
          description: "Official name of the contracting authority.",
        },
      },
    ],
  };
}

function organizationHasContracts(): Relation {
  return {
    id: "organization_has_contracts",
    name: "Organization has contracts",
    fromEntity: "organization",
    toEntity: "contract",
    fromColumn: "cf_amministrazione_appaltante",
    toColumn: "cf_amministrazione_appaltante",
    cardinality: "one_to_many",
    status: "confirmed",
    confidence: 0.95,
    provenance: {
      table: ANAC_ORGS,
      column: "cf_amministrazione_appaltante",
      evidence: "Fiscal code join",
    },
  };
}

export function anacPackCommands(): AuthoringCommand[] {
  return [
    { type: "addEntity", entity: contractEntity() },
    { type: "addEntity", entity: organizationEntity() },
    { type: "addRelation", relation: organizationHasContracts() },
    {
      type: "upsertGlossaryTerm",
      term: {
        id: "ingest-month",
        term: "mese di ingest",
        definition:
          "Calendar month when the ANAC snapshot was loaded into the warehouse (source_year_month, YYYY-MM). Distinct from publication date fields.",
        objectId: "contract",
        propertyId: "source_year_month",
      },
    },
  ];
}
