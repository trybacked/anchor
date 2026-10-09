import { describe, expect, it } from "vitest";
import { importModelContent } from "../../src/authoring/draft-service.js";

const minimalModelJson = JSON.stringify({
  metadata: {
    formatVersion: "1",
    runId: "test-run",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [],
  relations: [
    {
      id: "orders_customers",
      name: "Orders to customers",
      fromEntity: "orders",
      toEntity: "customers",
      fromColumn: "customer_id",
      toColumn: "id",
      cardinality: "many_to_one",
      status: "proposed",
      confidence: 0.9,
      provenance: { table: "orders", column: "customer_id", evidence: "fk" },
    },
  ],
  rules: [],
});

describe("importModelContent", () => {
  it("accepts many_to_one relation cardinality in JSON imports", () => {
    const model = importModelContent("json", minimalModelJson);
    expect(model.relations[0]?.cardinality).toBe("many_to_one");
  });
});
