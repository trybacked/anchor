import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { validateRoutedPlan } from "../../src/validate-plan.js";
const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.procurement.contracts",
      properties: [
        { id: "source_year_month", name: "Month", type: "string", role: "attribute" },
        { id: "document_id", name: "Document", type: "string", role: "attribute" },
      ],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};
describe("validateRoutedPlan", () => {
  it("accepts single route with objectQuery", () => {
    const result = validateRoutedPlan(ontology, {
      route: "single",
      objectQuery: {
        entityId: "contract",
        mode: "count",
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
      },
    });
    expect(result.route).toBe("single");
  });
  it("rejects template route", () => {
    expect(() =>
      validateRoutedPlan(ontology, {
        route: "template",
        templateId: "search_then_filter",
        params: { query: "test" },
      }),
    ).toThrow(/single/);
  });
});
