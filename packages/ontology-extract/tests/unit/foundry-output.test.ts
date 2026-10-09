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

  it("repairs partial linkTypes and doubts instead of failing validation", () => {
    const output = parseFoundryExtractOutput(
      JSON.stringify({
        locale: "it",
        instances: [
          {
            objectTypeId: "document",
            name: "Leonardo",
            sourceFiles: ["leonardo.pdf"],
            evidence: "PDF in archive",
          },
        ],
        linkTypes: [
          { fromType: "person", toType: "organization" },
          { fromType: "document", toType: "topic", name: "mentions" },
        ],
        doubts: [{ topic: "Ambiguity", question: "Which Leonardo?" }, { question: "missing topic" }],
      }),
    );
    expect(output.linkTypes).toHaveLength(2);
    expect(output.linkTypes?.[0]?.id).toBe("person_to_organization");
    expect(output.doubts).toHaveLength(1);
    expect(output.doubts?.[0]?.reason.length).toBeGreaterThan(0);
  });
});
