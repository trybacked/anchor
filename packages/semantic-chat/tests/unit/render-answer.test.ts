import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { renderPlanAnswer } from "../../src/plan-first/render-answer.js";
import { contractOntology } from "./agent-fixtures.js";

function labelledContractOntology(): Ontology {
  const ontology = contractOntology();
  const [contract] = ontology.objects;
  if (contract === undefined) throw new Error("fixture without objects");
  return {
    ...ontology,
    objects: [
      {
        ...contract,
        semantics: {
          ...contract.semantics,
          labels: {
            it: { singular: "contratto", plural: "contratti" },
            en: { singular: "contract", plural: "contracts" },
          },
        },
        properties: contract.properties.map((property) =>
          property.id === "region"
            ? {
                ...property,
                semantics: {
                  labels: { it: "regione", en: "region" },
                  sampleValues: ["SEZIONE REGIONALE CALABRIA", "SEZIONE REGIONALE LAZIO"],
                },
              }
            : property,
        ),
      },
    ],
  };
}

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
    expect(rendered.text).toContain("Ci sono **121.416** Contract.");
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

  it("renders a breakdown with group labels and bare single measure", () => {
    const rendered = renderPlanAnswer({
      ontology: contractOntology(),
      query: {
        objectId: "contract",
        mode: "rows",
        filters: [],
        groupBy: ["region"],
        aggregations: [{ op: "count", alias: "count" }],
      },
      result: {
        objectId: "contract",
        columns: ["region", "count"],
        rows: [
          { region: "Calabria", count: 358 },
          { region: "Sicilia", count: 16052 },
        ],
        rowCount: 2,
        mode: "rows",
      },
      locale: "it",
      toolCallId: "plan-query",
    });
    expect(rendered.text).toContain("Contract per Region:");
    expect(rendered.text).toContain("- **Calabria**: 358");
    expect(rendered.text).toContain("- **Sicilia**: 16.052");
    expect(rendered.text).not.toContain("count:");
  });

  it("names the object as users do, with the right number", () => {
    const base = {
      ontology: labelledContractOntology(),
      query: { objectId: "contract", mode: "count" as const, filters: [] },
      locale: "it-IT",
      toolCallId: "plan-query",
    };
    const result = (count: number) => ({
      objectId: "contract",
      columns: ["count"],
      rows: [{ count }],
      rowCount: 1,
      mode: "count" as const,
    });
    expect(renderPlanAnswer({ ...base, result: result(121416) }).text).toBe(
      "Ci sono **121.416** contratti.",
    );
    expect(renderPlanAnswer({ ...base, result: result(1) }).text).toBe("Ci sono **1** contratto.");
  });

  it("names the owning object next to a joined property, without repeating it", () => {
    const ontology = labelledContractOntology();
    const organization: Ontology["objects"][number] = {
      id: "organization",
      name: "Organization",
      semantics: { labels: { it: { singular: "ente appaltante", plural: "enti appaltanti" } } },
      properties: [
        { id: "nome", name: "Nome", type: "string", semantics: { labels: { it: "nome" } } },
        {
          id: "ente_appaltante",
          name: "Ente",
          type: "string",
          semantics: { labels: { it: "ente appaltante" } },
        },
      ],
    };
    const rendered = renderPlanAnswer({
      ontology: { ...ontology, objects: [...ontology.objects, organization] },
      query: {
        objectId: "contract",
        mode: "count",
        filters: [
          { objectId: "organization", propertyId: "nome", op: "contains", value: "Gerace" },
          {
            objectId: "organization",
            propertyId: "ente_appaltante",
            op: "contains",
            value: "Comune",
          },
        ],
      },
      result: {
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: 9 }],
        rowCount: 1,
        mode: "count",
      },
      locale: "it",
      toolCallId: "plan-query",
    });
    expect(rendered.text).toContain("nome (ente appaltante) contiene «Gerace»");
    expect(rendered.text).toContain("ente appaltante contiene «Comune»");
    expect(rendered.text).not.toContain("ente appaltante (ente appaltante)");
  });

  it("shows how a filtered column is written when nothing matched", () => {
    const rendered = renderPlanAnswer({
      ontology: labelledContractOntology(),
      query: {
        objectId: "contract",
        mode: "count",
        filters: [{ propertyId: "region", op: "eq", value: "Reggio Calabria" }],
      },
      result: {
        objectId: "contract",
        columns: ["count"],
        rows: [{ count: 0 }],
        rowCount: 1,
        mode: "count",
      },
      locale: "it",
      toolCallId: "plan-query",
    });
    expect(rendered.text).toContain("non ci sono contratti con questi criteri");
    expect(rendered.text).toContain("regione uguale a «Reggio Calabria»");
    expect(rendered.text).toContain(
      "Nei dati, regione è scritta così: «SEZIONE REGIONALE CALABRIA», «SEZIONE REGIONALE LAZIO».",
    );
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
