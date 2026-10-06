import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
} from "../../src/validate-plan.js";
import { normalizeSemanticQueryPlan } from "../../src/normalize.js";
const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.procurement.contracts",
      properties: [{ id: "oggetto_gara", name: "Subject", type: "string", role: "attribute" }],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};
describe("validateObjectQueryAgainstOntology", () => {
  it('rejects mode "count" combined with textSearch', () => {
    const normalized = normalizeSemanticQueryPlan({
      objectQuery: {
        entityId: "contract",
        mode: "count",
        filters: [],
        textSearch: { query: "anything", columns: ["oggetto_gara"] },
      },
    });
    expect(() => validateObjectQueryAgainstOntology(ontology, normalized.objectQuery)).toThrow(
      SemanticPlanValidationError,
    );
  });
  it('accepts mode "count" with contains filter instead of textSearch', () => {
    const normalized = normalizeSemanticQueryPlan({
      objectQuery: {
        entityId: "contract",
        mode: "count",
        filters: [{ propertyId: "oggetto_gara", op: "contains", value: "ferrovie" }],
      },
    });
    const validated = validateObjectQueryAgainstOntology(ontology, normalized.objectQuery);
    expect(validated.mode).toBe("count");
    expect(validated.textSearch).toBeUndefined();
  });
  it("drops ordering from a count, which is a scalar", () => {
    const validated = validateObjectQueryAgainstOntology(ontology, {
      objectId: "contract",
      mode: "count",
      filters: [],
      orderBy: ":none",
      orderDirection: "asc",
    });
    expect(validated.orderBy).toBeUndefined();
    expect(validated.orderDirection).toBeUndefined();
  });
  it("accepts a breakdown by a joined property ordered by the aggregation alias", () => {
    const withOrganization: Ontology = {
      ...ontology,
      objects: [
        ...ontology.objects,
        {
          id: "organization",
          name: "Organization",
          properties: [{ id: "region", name: "Region", type: "string", role: "attribute" }],
        },
      ],
    };
    const validated = validateObjectQueryAgainstOntology(withOrganization, {
      objectId: "contract",
      mode: "rows",
      joins: [{ relationshipId: "organization_has_contracts" }],
      filters: [],
      groupBy: ["organization.region"],
      aggregations: [{ op: "count", alias: "count" }],
      orderBy: "count",
      orderDirection: "desc",
    });
    expect(validated.groupBy).toEqual(["organization.region"]);
  });
  it("rejects a rows sort key that is not a property", () => {
    expect(() =>
      validateObjectQueryAgainstOntology(ontology, {
        objectId: "contract",
        mode: "rows",
        filters: [],
        orderBy: "ghost",
      }),
    ).toThrow(SemanticPlanValidationError);
  });
});
