import { describe, expect, it } from "vitest";
import { parseOntologyExtractOutput } from "../../src/extract-output.js";

describe("normalizeExtractJson via parseOntologyExtractOutput", () => {
  it("coerces entity label strings and property label objects", () => {
    const output = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [
          {
            id: "documents",
            semantics: { labels: { it: "Documento" } },
            properties: [
              {
                columnName: "document_id",
                semantics: { labels: { it: { singular: "id doc", plural: "id doc" } } },
              },
            ],
          },
        ],
      }),
    );
    expect(output.entities[0]?.semantics?.labels?.it).toEqual({
      singular: "Documento",
      plural: "Documento",
    });
    expect(output.entities[0]?.properties?.[0]?.semantics?.labels?.it).toBe("id doc");
  });
});
