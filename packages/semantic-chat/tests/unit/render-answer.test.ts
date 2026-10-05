import { describe, expect, it } from "vitest";
import { renderPlanAnswer } from "../../src/plan-first/render-answer.js";
import { contractOntology } from "./agent-fixtures.js";

describe("renderPlanAnswer", () => {
  it("renders a localized count with human labels and a grounded claim", () => {
    const rendered = renderPlanAnswer({
      ontology: contractOntology(),
      query: {
        objectId: "contract",
        mode: "count",
        filters: [
          { propertyId: "load_month", op: "eq", value: "2025-06" },
          { propertyId: "region", op: "contains", value: "Calabria" },
        ],
      },
      result: {
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: "121416" }],
        rowCount: 1,
        mode: "count",
      },
      locale: "it",
      toolCallId: "plan-query",
    });
    expect(rendered.text).toContain("**121.416** Contract");
    expect(rendered.text).toContain("Load Month uguale a «2025-06»");
    expect(rendered.text).toContain("Region contiene «Calabria»");
    expect(rendered.text).not.toContain("load_month");
    expect(rendered.claims).toEqual([{ text: "121.416", toolCallId: "plan-query" }]);
  });

  it("says no results for an empty listing and lists rows otherwise", () => {
    const base = {
      ontology: contractOntology(),
      query: {
        objectId: "contract",
        mode: "rows" as const,
        filters: [],
        select: ["cig", "region"],
      },
      locale: "en",
      toolCallId: "plan-query",
    };
    const empty = renderPlanAnswer({
      ...base,
      result: {
        objectId: "contract",
        columns: ["cig", "region"],
        rows: [],
        rowCount: 0,
        mode: "rows",
      },
    });
    expect(empty.text).toBe("No Contract match these criteria.");
    expect(empty.claims).toEqual([]);

    const listed = renderPlanAnswer({
      ...base,
      result: {
        objectId: "contract",
        columns: ["cig", "region"],
        rows: [{ cig: "B719A2AE0D", region: "Calabria" }],
        rowCount: 1,
        mode: "rows",
      },
    });
    expect(listed.text).toContain("**1** Contract:");
    expect(listed.text).toContain("- **B719A2AE0D** · Region: Calabria");
  });

  it("falls back to English for unknown locales", () => {
    const rendered = renderPlanAnswer({
      ontology: contractOntology(),
      query: { objectId: "contract", mode: "count", filters: [] },
      result: {
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: 0 }],
        rowCount: 1,
        mode: "count",
      },
      locale: "xx",
      toolCallId: "plan-query",
    });
    expect(rendered.text).toBe("No Contract match these criteria.");
  });
});
