import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { createDefaultPlanTemplateRegistry } from "../../src/template-registry.js";
import { validateRoutedPlan } from "../../src/validate-plan.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "backed.anac.contracts",
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
  const registry = createDefaultPlanTemplateRegistry();

  it("accepts single route with objectQuery", () => {
    const result = validateRoutedPlan(ontology, registry, {
      route: "single",
      objectQuery: {
        entityId: "contract",
        mode: "count",
        filters: [{ propertyId: "source_year_month", op: "eq", value: "2025-06" }],
      },
    });
    expect(result.route).toBe("single");
  });

  it("accepts template route with params", () => {
    const result = validateRoutedPlan(ontology, registry, {
      route: "template",
      templateId: "search-then-filter",
      params: { query: "ascensore", month: "2025-06" },
    });
    expect(result.route).toBe("template");
    if (result.route === "template") {
      expect(result.instantiated.steps).toHaveLength(2);
    }
  });

  it("rejects unknown template id", () => {
    expect(() =>
      validateRoutedPlan(ontology, registry, {
        route: "template",
        templateId: "missing",
        params: { query: "x", month: "2025-06" },
      }),
    ).toThrow();
  });
});
