import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { searchOntologySchema } from "../../src/tools/search-schema.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      properties: [
        {
          id: "source_year_month",
          name: "Source Year Month",
          type: "string",
          semantics: {
            semanticRole: "partition",
            synonyms: ["mese ingest"],
          },
        },
      ],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
  semantics: {
    glossary: [
      {
        id: "ingest",
        term: "ingest month",
        definition: "Warehouse batch month",
        objectId: "contract",
        propertyId: "source_year_month",
      },
    ],
    examples: [],
  },
};

describe("searchOntologySchema", () => {
  it("ranks partition property for ingest question", () => {
    const hits = searchOntologySchema(ontology, "contracts ingest month 2025");
    expect(hits.some((hit) => hit.propertyId === "source_year_month")).toBe(true);
  });
});
