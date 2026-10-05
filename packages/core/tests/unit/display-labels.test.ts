import { describe, expect, it } from "vitest";
import { objectLabel, propertyLabel } from "../../src/display-labels.js";
import type { Ontology } from "../../src/ontology/spec.js";

function ontology(): Ontology {
  return {
    metadata: { formatVersion: "1", id: "test", version: 1 },
    objects: [
      {
        id: "contract",
        name: "Contract",
        semantics: { labels: { it: { singular: "contratto", plural: "contratti" } } },
        properties: [
          {
            id: "provincia",
            name: "Provincia",
            type: "string",
            semantics: { labels: { it: "provincia", en: "province" } },
          },
          { id: "stato", name: "Stato", type: "string" },
        ],
      },
    ],
    relationships: [],
    logic: [],
    actions: [],
  };
}

describe("display labels", () => {
  it("prefers the authored label for the request language, region included", () => {
    expect(objectLabel(ontology(), "contract", "it-IT")).toBe("contratti");
    expect(objectLabel(ontology(), "contract", "it", "singular")).toBe("contratto");
    expect(propertyLabel(ontology(), "contract", "provincia", "en")).toBe("province");
  });

  it("falls back to the ontology name when no label is authored", () => {
    expect(objectLabel(ontology(), "contract", "de")).toBe("Contract");
    expect(propertyLabel(ontology(), "contract", "stato", "it")).toBe("Stato");
  });

  it("falls back to the id for unknown objects and properties", () => {
    expect(objectLabel(ontology(), "ghost", "it")).toBe("ghost");
    expect(propertyLabel(ontology(), "contract", "ghost", "it")).toBe("ghost");
  });
});
