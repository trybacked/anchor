import { describe, expect, it } from "vitest";
import { instantiatePlanTemplate, collectTemplateRowLimits } from "../../src/instantiate-template.js";
import { PlanTemplateStructureError } from "../../src/plan-template.js";
import { SEARCH_THEN_FILTER_TEMPLATE } from "../../src/templates/search-then-filter.js";

describe("instantiate-template", () => {
  it("substitutes params into filters and chunk query", () => {
    const plan = instantiatePlanTemplate(SEARCH_THEN_FILTER_TEMPLATE, {
      query: "manutenzione ascensore",
      month: "2025-06",
    });
    expect(plan.templateId).toBe("search-then-filter");
    expect(plan.steps[0]).toMatchObject({
      type: "chunkSearch",
      query: "manutenzione ascensore",
      limit: 20,
    });
    const objectStep = plan.steps[1];
    expect(objectStep?.type).toBe("objectQuery");
    if (objectStep?.type === "objectQuery") {
      expect(objectStep.query.filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ propertyId: "source_year_month", value: "2025-06" }),
        ]),
      );
      expect(objectStep.consumes).toEqual(["search"]);
    }
  });

  it("throws on missing param", () => {
    expect(() =>
      instantiatePlanTemplate(SEARCH_THEN_FILTER_TEMPLATE, { query: "x" }),
    ).toThrow(PlanTemplateStructureError);
  });

  it("collects row limits for aggregate budget", () => {
    const plan = instantiatePlanTemplate(SEARCH_THEN_FILTER_TEMPLATE, {
      query: "x",
      month: "2025-06",
    });
    expect(collectTemplateRowLimits(plan.steps)).toEqual([20, 15]);
  });
});
