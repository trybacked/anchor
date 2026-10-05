import { describe, expect, it } from "vitest";
import { SHARED_SEMANTIC_CATALOGS } from "@trybacked/ontology-authoring";
import { applySemanticCatalogs } from "@trybacked/core";
import {
  assertQuestionDoesNotMentionUnknownProperties,
  validateAgentObjectQuery,
} from "../../src/query-intent.js";
import { contractOntology } from "./agent-fixtures.js";
const ANAC_CONTRACTS_DATASET = "backed.anac.contracts";
const ANAC_ORGANIZATIONS_DATASET = "backed.anac.organizations";

function anacJoinOntology() {
  const base = {
    metadata: { formatVersion: "1" as const, id: "test-anac", version: 1 },
    objects: [
      {
        id: "contract",
        name: "Contract",
        sourceDatasetId: ANAC_CONTRACTS_DATASET,
        properties: [
          { id: "source_year_month", name: "Ingest month", type: "string" },
          { id: "sezione_regionale", name: "Regional section", type: "string" },
        ],
      },
      {
        id: "organization",
        name: "Organization",
        sourceDatasetId: ANAC_ORGANIZATIONS_DATASET,
        properties: [{ id: "sezione_regionale", name: "Regional section", type: "string" }],
      },
    ],
    relationships: [
      {
        id: "organization_has_contracts",
        name: "Organization has contracts",
        fromObjectId: "organization",
        toObjectId: "contract",
        cardinality: "one_to_many" as const,
      },
    ],
    logic: [],
    actions: [],
  };
  return applySemanticCatalogs(base, SHARED_SEMANTIC_CATALOGS);
}

describe("query intent", () => {
  it("rejects questions that name a property id absent from the ontology", () => {
    const ontology = contractOntology();
    expect(() =>
      assertQuestionDoesNotMentionUnknownProperties(
        ontology,
        "How many contracts have crm_customer_id populated?",
      ),
    ).toThrow(/Unknown property "crm_customer_id"/);
  });

  it("requires joins when glossary ties a shared property to a related entity", () => {
    const ontology = anacJoinOntology();
    expect(() =>
      validateAgentObjectQuery(ontology, "How many contracts involve entities with regional section Sicilia?", {
        objectId: "contract",
        mode: "count",
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          { propertyId: "sezione_regionale", op: "eq", value: "Sicilia" },
        ],
      }),
    ).toThrow(/use joins and filters with objectId organization/);
  });

  it("rejects a join with only a root-level shared property filter", () => {
    const ontology = anacJoinOntology();
    expect(() =>
      validateAgentObjectQuery(ontology, "How many contracts involve entities with regional section Sicilia?", {
        objectId: "contract",
        mode: "count",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          { propertyId: "sezione_regionale", op: "eq", value: "Sicilia" },
        ],
      }),
    ).toThrow(/Missing filter on organization for sezione_regionale/);
  });

  it("accepts a joined filter on the related object", () => {
    const ontology = anacJoinOntology();
    expect(() =>
      validateAgentObjectQuery(ontology, "How many contracts involve entities with regional section Sicilia?", {
        objectId: "contract",
        mode: "count",
        joins: [{ relationshipId: "organization_has_contracts" }],
        filters: [
          { propertyId: "source_year_month", op: "eq", value: "2025-06" },
          {
            objectId: "organization",
            propertyId: "sezione_regionale",
            op: "eq",
            value: "Sicilia",
          },
        ],
      }),
    ).not.toThrow();
  });
});
