import { describe, expect, it } from "vitest";
import {
  PLANNER_OUTPUT_CONTRACT,
  PlannerOutputError,
  parsePlannerOutput,
} from "../../src/plan-first/planner-output.js";

const plan = {
  locale: "it",
  query: {
    objectId: "contract",
    mode: "rows",
    filters: [{ propertyId: "region", op: "contains", value: "Calabria" }],
  },
  unanswerable: null,
  assumptions: [],
};

describe("parsePlannerOutput", () => {
  it("accepts bare JSON", () => {
    expect(parsePlannerOutput(JSON.stringify(plan)).query?.filters).toHaveLength(1);
  });

  it("accepts fenced JSON and surrounding prose", () => {
    const text = `Ecco il piano:\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``;
    expect(parsePlannerOutput(text).locale).toBe("it");
  });

  it("rejects unknown query keys instead of dropping them", () => {
    const text = JSON.stringify({ ...plan, query: { objectId: "contract", where: [] } });
    expect(() => parsePlannerOutput(text)).toThrow(PlannerOutputError);
  });

  it("rejects text without a JSON object", () => {
    expect(() => parsePlannerOutput("non json")).toThrow(/no JSON object/);
  });
});

describe("PLANNER_OUTPUT_CONTRACT", () => {
  it("is derived from the compiler schemas", () => {
    expect(PLANNER_OUTPUT_CONTRACT).toContain("filters[] keys: objectId, propertyId, op, value");
    expect(PLANNER_OUTPUT_CONTRACT).toContain("mode: rows | count");
    expect(PLANNER_OUTPUT_CONTRACT).toContain("starts_with");
  });
});
