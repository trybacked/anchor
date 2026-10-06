import { describe, expect, it } from "vitest";
import { isThinWarehouseListing } from "../../src/plan-first/thin-plan.js";
import type { PlanFirstResult } from "../../src/plan-first/run-plan-first.js";

function planResult(partial: Partial<PlanFirstResult["result"]>): PlanFirstResult {
  return {
    runId: "r1",
    answer: "",
    claims: [],
    assumptions: [],
    plan: { objectQuery: { objectId: "person", mode: "rows" } },
    result: {
      objectId: "person",
      columns: ["name"],
      rows: [{ name: "luca tropea" }],
      rowCount: 1,
      mode: "rows",
      sql: "",
      ...partial,
    },
    steps: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0 },
  };
}

describe("isThinWarehouseListing", () => {
  it("flags sparse name-only listings", () => {
    expect(isThinWarehouseListing(planResult({}))).toBe(true);
  });

  it("accepts count answers", () => {
    expect(
      isThinWarehouseListing(
        planResult({
          mode: "count",
          rows: [{ count: 12 }],
          rowCount: 1,
        }),
      ),
    ).toBe(false);
  });
});
