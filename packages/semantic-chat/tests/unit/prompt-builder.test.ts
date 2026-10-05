import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "../../src/agent/prompt-builder.js";

const minimalOntology: Ontology = {
  metadata: { id: "demo", version: 1 },
  relationships: [],
  objects: [
    {
      id: "contract",
      name: "Contract",
      status: "published",
      properties: [{ id: "cig", type: "string", role: "dimension" }],
      relationships: [],
    },
  ],
};

describe("buildAgentSystemPrompt", () => {
  it("includes user-facing answer style for non-technical UI copy", () => {
    const prompt = buildAgentSystemPrompt(minimalOntology, "Quanti contratti?");
    expect(prompt).toContain("User-facing answer");
    expect(prompt).toContain("not engineers");
    expect(prompt).toContain("Never put in answer");
  });
});
