import type {
  AuthoringCommand,
  EntitySemantics,
  Entity,
  PropertySemantics,
  Relation,
} from "@trybacked/core";
import {
  ANAC_CONTRACTS_DATASET,
  ANAC_ORGANIZATIONS_DATASET,
  ANAC_SEMANTIC_CATALOG,
} from "./anac-semantics.js";
const ENTITY_ID_BY_DATASET: Record<string, string> = {
  [ANAC_CONTRACTS_DATASET]: "contract",
  [ANAC_ORGANIZATIONS_DATASET]: "organization",
};
function entitySemantics(datasetId: string): {
  semantics?: EntitySemantics;
} {
  const semantics = ANAC_SEMANTIC_CATALOG.datasets[datasetId]?.entity;
  return semantics !== undefined ? { semantics } : {};
}
function propertySemantics(
  datasetId: string,
  columnName: string,
): {
  semantics?: PropertySemantics;
} {
  const semantics = ANAC_SEMANTIC_CATALOG.datasets[datasetId]?.properties[columnName];
  return semantics !== undefined ? { semantics } : {};
}
function contractEntity(): Entity {
  return {
    id: "contract",
    name: "Contract",
    description: "National procurement contract row from shared ANAC enrollment (CIG-level).",
    sourceTable: ANAC_CONTRACTS_DATASET,
    status: "confirmed",
    confidence: 0.85,
    provenance: { table: ANAC_CONTRACTS_DATASET, evidence: "Shared ANAC contracts enrollment" },
    ...entitySemantics(ANAC_CONTRACTS_DATASET),
    properties: [
      {
        name: "Cig",
        columnName: "cig",
        semanticType: "text",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: { table: ANAC_CONTRACTS_DATASET, column: "cig", evidence: "CIG primary key" },
        ...propertySemantics(ANAC_CONTRACTS_DATASET, "cig"),
      },
      {
        name: "Source Year Month",
        columnName: "source_year_month",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: {
          table: ANAC_CONTRACTS_DATASET,
          column: "source_year_month",
          evidence: "Ingest month partition",
        },
        ...propertySemantics(ANAC_CONTRACTS_DATASET, "source_year_month"),
      },
      {
        name: "Cf Amministrazione Appaltante",
        columnName: "cf_amministrazione_appaltante",
        semanticType: "text",
        role: "attribute",
        nullable: true,
        confidence: 0.9,
        provenance: {
          table: ANAC_CONTRACTS_DATASET,
          column: "cf_amministrazione_appaltante",
          evidence: "Organization fiscal code on contract",
        },
        ...propertySemantics(ANAC_CONTRACTS_DATASET, "cf_amministrazione_appaltante"),
      },
    ],
  };
}
function organizationEntity(): Entity {
  return {
    id: "organization",
    name: "Organization",
    description: "Contracting authority (ente appaltante) from shared ANAC organizations.",
    sourceTable: ANAC_ORGANIZATIONS_DATASET,
    status: "confirmed",
    confidence: 0.85,
    provenance: {
      table: ANAC_ORGANIZATIONS_DATASET,
      evidence: "Shared ANAC organizations enrollment",
    },
    ...entitySemantics(ANAC_ORGANIZATIONS_DATASET),
    properties: [
      {
        name: "Cf Amministrazione Appaltante",
        columnName: "cf_amministrazione_appaltante",
        semanticType: "text",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: {
          table: ANAC_ORGANIZATIONS_DATASET,
          column: "cf_amministrazione_appaltante",
          evidence: "Organization fiscal code",
        },
        ...propertySemantics(ANAC_ORGANIZATIONS_DATASET, "cf_amministrazione_appaltante"),
      },
      {
        name: "Denominazione Amministrazione Appaltante",
        columnName: "denominazione_amministrazione_appaltante",
        semanticType: "text",
        role: "attribute",
        nullable: false,
        confidence: 0.9,
        provenance: {
          table: ANAC_ORGANIZATIONS_DATASET,
          column: "denominazione_amministrazione_appaltante",
          evidence: "Organization name",
        },
        ...propertySemantics(
          ANAC_ORGANIZATIONS_DATASET,
          "denominazione_amministrazione_appaltante",
        ),
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
      table: ANAC_ORGANIZATIONS_DATASET,
      column: "cf_amministrazione_appaltante",
      evidence: "Fiscal code join",
    },
  };
}
function glossaryCommands(): AuthoringCommand[] {
  return ANAC_SEMANTIC_CATALOG.glossary.map((term) => {
    const objectId =
      term.datasetId !== undefined ? ENTITY_ID_BY_DATASET[term.datasetId] : undefined;
    return {
      type: "upsertGlossaryTerm",
      term: {
        id: term.id,
        term: term.term,
        definition: term.definition,
        ...(objectId !== undefined ? { objectId } : {}),
        ...(term.propertyId !== undefined ? { propertyId: term.propertyId } : {}),
      },
    };
  });
}
export function anacPackCommands(): AuthoringCommand[] {
  return [
    { type: "addEntity", entity: contractEntity() },
    { type: "addEntity", entity: organizationEntity() },
    { type: "addRelation", relation: organizationHasContracts() },
    ...glossaryCommands(),
  ];
}
