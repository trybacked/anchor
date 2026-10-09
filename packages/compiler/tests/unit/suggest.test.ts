import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  allowedValuesFrom,
  levenshteinDistance,
  normalizeForSuggestions,
  objectSuggestionEntries,
  propertySuggestionEntries,
  relationshipSuggestionEntries,
  suggestClosest,
} from "../../src/index.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.contracts",
      semantics: {
        synonyms: ["gara"],
        labels: { it: { singular: "contratto", plural: "contratti" } },
      },
      properties: [
        {
          id: "importo_lotto",
          name: "Importo lotto",
          type: "float",
          role: "attribute",
          semantics: { synonyms: ["importo", "ammontare"] },
        },
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
      ],
    },
    {
      id: "organization",
      name: "Organization",
      sourceDatasetId: "demo.organizations",
      properties: [
        { id: "sezione_regionale", name: "Sezione regionale", type: "string", role: "attribute" },
      ],
    },
  ],
  relationships: [
    {
      id: "organization_has_contracts",
      name: "Organization has contracts",
      fromObjectId: "organization",
      toObjectId: "contract",
      cardinality: "one_to_many",
    },
  ],
  logic: [],
  actions: [],
};

describe("levenshteinDistance", () => {
  it("counts edits between strings", () => {
    expect(levenshteinDistance("impotno", "importo")).toBe(2);
    expect(levenshteinDistance("cig", "cig")).toBe(0);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });
});

describe("normalizeForSuggestions", () => {
  it("strips accents, case and separators", () => {
    expect(normalizeForSuggestions("Importò Lotto")).toBe("importolotto");
    expect(normalizeForSuggestions("sezione-regionale")).toBe("sezioneregionale");
  });
});

describe("suggestClosest", () => {
  const entries = propertySuggestionEntries(ontology.objects[0]!);

  it("maps typos to the closest property id", () => {
    expect(suggestClosest("impotno", entries)).toContain("importo_lotto");
  });

  it("maps a synonym to the canonical id", () => {
    expect(suggestClosest("ammontare", entries)).toEqual(["importo_lotto"]);
  });

  it("matches prefixes by containment", () => {
    expect(suggestClosest("importo", entries)).toContain("importo_lotto");
  });

  it("is accent- and case-insensitive", () => {
    expect(
      suggestClosest("Sezione Regiónale", propertySuggestionEntries(ontology.objects[1]!)),
    ).toEqual(["sezione_regionale"]);
  });

  it("returns nothing for unrelated values", () => {
    expect(suggestClosest("quantum_fluctuation", entries)).toEqual([]);
  });

  it("ranks nearer matches first and caps results", () => {
    const ranked = suggestClosest("cigg", entries);
    expect(ranked[0]).toBe("cig");
  });

  it("resolves entity and relationship names through the ontology", () => {
    expect(suggestClosest("gara", objectSuggestionEntries(ontology))).toEqual(["contract"]);
    expect(suggestClosest("contratti", objectSuggestionEntries(ontology))).toEqual(["contract"]);
    expect(
      suggestClosest("organization has contracts", relationshipSuggestionEntries(ontology)),
    ).toEqual(["organization_has_contracts"]);
  });

  it("respects the result limit", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ canonical: `prop_${index}` }));
    expect(suggestClosest("prop_1", many)).toHaveLength(3);
  });
});

describe("allowedValuesFrom", () => {
  it("caps the canonical id list", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ canonical: `p${String(index)}` }));
    expect(allowedValuesFrom(many)).toHaveLength(20);
  });
});
