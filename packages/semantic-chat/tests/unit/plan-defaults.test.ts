import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { applySemanticChatSelectDefault } from "../../src/plan-defaults.js";
const wideContractOntology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        ...Array.from({ length: 25 }, (_, index) => ({
          id: `field_${String(index)}`,
          name: `Field ${String(index)}`,
          type: "string" as const,
          role: "attribute" as const,
        })),
      ],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};
describe("applySemanticChatSelectDefault", () => {
  it("adds select on wide objects when mode is rows", () => {
    const query = applySemanticChatSelectDefault(wideContractOntology, {
      objectId: "contract",
      mode: "rows",
      filters: [],
      limit: 10,
    });
    expect(query.select).toContain("cig");
    expect(query.select?.length).toBeLessThanOrEqual(10);
  });
  it("does not change count queries", () => {
    const query = applySemanticChatSelectDefault(wideContractOntology, {
      objectId: "contract",
      mode: "count",
      filters: [],
    });
    expect(query.select).toBeUndefined();
  });
});
