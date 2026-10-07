import { describe, expect, it } from "vitest";
import { applyCommand, applyCommands, emptySemanticModel } from "../../src/apply-command.js";
import { diffSemanticModels } from "../../src/diff-models.js";
describe("diffSemanticModels semantics", () => {
  it("classifies glossary changes as non-breaking", () => {
    // Packs are data now (Plan Fase 7): build the base model from commands.
    const base = applyCommands(emptySemanticModel("diff"), [
      {
        type: "addEntity",
        entity: {
          id: "organization",
          name: "Organization",
          sourceTable: "cat.schema.orgs",
          status: "confirmed",
          confidence: 1,
          provenance: { table: "cat.schema.orgs", evidence: "test" },
          properties: [],
        },
      },
    ]);
    const after = applyCommand(base, {
      type: "upsertGlossaryTerm",
      term: {
        id: "test-term",
        term: "test",
        definition: "A test glossary entry",
        objectId: "organization",
      },
    });
    const changes = diffSemanticModels(base, after);
    expect(
      changes.some(
        (change) => change.subject === "semantics.glossary" && change.kind === "changed",
      ),
    ).toBe(true);
  });
});
