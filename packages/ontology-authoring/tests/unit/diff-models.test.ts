import { describe, expect, it } from "vitest";
import { applyCommand, applyCommands, emptySemanticModel } from "../../src/apply-command.js";
import { diffSemanticModels } from "../../src/diff-models.js";
describe("diffSemanticModels semantics", () => {
  it("classifies glossary changes as non-breaking", () => {
    const before = applyCommands(emptySemanticModel("diff"), [
      { type: "applyPack", packId: "anac" },
    ]);
    const after = applyCommand(before, {
      type: "upsertGlossaryTerm",
      term: {
        id: "test-term",
        term: "test",
        definition: "A test glossary entry",
        objectId: "contract",
      },
    });
    const changes = diffSemanticModels(before, after);
    expect(
      changes.some(
        (change) => change.subject === "semantics.glossary" && change.kind === "changed",
      ),
    ).toBe(true);
  });
});
