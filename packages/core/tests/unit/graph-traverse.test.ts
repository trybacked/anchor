import { describe, expect, it } from "vitest";
import { buildRelationPath, clampTraverseDepth } from "../../src/graph-traverse.js";
import type { SemanticModel } from "../../src/model.js";
const model: SemanticModel = {
  metadata: { formatVersion: "1", runId: "test", generatedAt: "2026-01-01T00:00:00.000Z" },
  entities: [],
  relations: [
    {
      id: "a_to_b",
      name: "A to B",
      fromEntity: "a",
      toEntity: "b",
      fromColumn: "a_id",
      toColumn: "b_id",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 1,
      provenance: { table: "a", column: "a_id", evidence: "test" },
    },
    {
      id: "b_to_c",
      name: "B to C",
      fromEntity: "b",
      toEntity: "c",
      fromColumn: "b_id",
      toColumn: "c_id",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 1,
      provenance: { table: "b", column: "b_id", evidence: "test" },
    },
  ],
  rules: [],
};
describe("graph-traverse", () => {
  it("clamps depth", () => {
    expect(clampTraverseDepth(undefined)).toBe(1);
    expect(clampTraverseDepth(99)).toBe(3);
  });
  it("builds a multi-hop path", () => {
    const hops = buildRelationPath(model, "a_to_b", "forward", 2);
    expect(hops?.map((hop) => hop.relationId)).toEqual(["a_to_b", "b_to_c"]);
  });
});
