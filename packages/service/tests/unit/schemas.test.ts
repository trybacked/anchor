import { describe, expect, it } from "vitest";
import { RelationSummarySchema } from "../../src/schemas.js";

describe("RelationSummarySchema", () => {
  it("accepts many_to_one cardinality", () => {
    const parsed = RelationSummarySchema.parse({
      id: "rel-1",
      name: "Rel",
      fromEntity: "a",
      toEntity: "b",
      fromColumn: "a_id",
      toColumn: "id",
      cardinality: "many_to_one",
      status: "confirmed",
    });
    expect(parsed.cardinality).toBe("many_to_one");
  });
});
