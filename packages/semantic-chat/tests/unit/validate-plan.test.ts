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
      sourceDatasetId: "backed.anac.contracts",
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
});
