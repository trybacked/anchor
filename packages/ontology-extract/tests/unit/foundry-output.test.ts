import { describe, expect, it } from "vitest";
import { parseFoundryExtractOutput } from "../../src/foundry/output.js";

describe("parseFoundryExtractOutput", () => {
  it("accepts schema-constrained instances (Text2KGBench / SPIRES style)", () => {
    const output = parseFoundryExtractOutput(
      JSON.stringify({
        locale: "it",
        instances: [
          {
            objectTypeId: "document",
            name: "NATO",
            normalizedName: "wiki_nato",
            sourceFiles: ["wiki-nato.pdf"],
            evidence: "PDF in archive",
          },
          {
            objectTypeId: "organization",
            name: "NATO",
            normalizedName: "nato",
            sourceFiles: ["wiki-nato.pdf"],
            evidence: "North Atlantic Treaty Organization",
          },
        ],
        doubts: [],
      }),
    );
    expect(output.instances).toHaveLength(2);
    expect(output.instances[1]?.objectTypeId).toBe("organization");
  });
});
