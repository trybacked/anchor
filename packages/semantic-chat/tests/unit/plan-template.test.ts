import { describe, expect, it } from "vitest";
import {
  assertPlanTemplateStructure,
  parsePlanTemplate,
  PlanTemplateStructureError,
} from "../../src/plan-template.js";
import { SEARCH_THEN_FILTER_TEMPLATE } from "../../src/templates/search-then-filter.js";

describe("plan-template", () => {
  it("validates search-then-filter template", () => {
    expect(() => parsePlanTemplate(SEARCH_THEN_FILTER_TEMPLATE)).not.toThrow();
  });

  it("rejects more than 3 steps", () => {
    const raw = {
      id: "too-many",
      description: "x",
      params: [{ name: "q", description: "q", type: "string" as const }],
      steps: [
        { type: "chunkSearch" as const, id: "a", queryParam: "q", limit: 5 },
        { type: "chunkSearch" as const, id: "b", queryParam: "q", limit: 5 },
        { type: "chunkSearch" as const, id: "c", queryParam: "q", limit: 5 },
        { type: "chunkSearch" as const, id: "d", queryParam: "q", limit: 5 },
      ],
    };
    expect(() => parsePlanTemplate(raw)).toThrow();
  });

  it("rejects consumes that reference a later step", () => {
    const template = {
      id: "bad-order",
      description: "x",
      params: [{ name: "q", description: "q", type: "string" as const }],
      steps: [
        {
          type: "objectQuery" as const,
          id: "first",
          consumes: ["search"],
          query: { entityId: "contract", filters: [] },
        },
        { type: "chunkSearch" as const, id: "search", queryParam: "q", limit: 5 },
      ],
    };
    expect(() => assertPlanTemplateStructure(template)).toThrow(PlanTemplateStructureError);
  });

  it("rejects consumes of non-chunkSearch step", () => {
    const template = {
      id: "bad-consume",
      description: "x",
      params: [{ name: "q", description: "q", type: "string" as const }],
      steps: [
        {
          type: "objectQuery" as const,
          id: "a",
          query: { entityId: "contract", filters: [] },
        },
        {
          type: "objectQuery" as const,
          id: "b",
          consumes: ["a"],
          query: { entityId: "contract", filters: [] },
        },
      ],
    };
    expect(() => assertPlanTemplateStructure(template)).toThrow(PlanTemplateStructureError);
  });
});
