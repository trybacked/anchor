import { validateSemanticModel, validateOntology, semanticModelToOntology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  FOUNDRY_DOCUMENT_OBJECT_TYPE_IDS,
  buildFoundryDocumentSemanticModel,
} from "../../src/foundry/index.js";

describe("buildFoundryDocumentSemanticModel", () => {
  it("produces a valid OBDA-style document ontology (11 entities, 10 relations)", () => {
    const model = buildFoundryDocumentSemanticModel({
      catalog: "backed_military",
      runId: "foundry-test",
      generatedAt: new Date("2026-10-09T12:00:00.000Z").toISOString(),
    });
    expect(model.entities.map((entity) => entity.id).sort()).toEqual(
      [...FOUNDRY_DOCUMENT_OBJECT_TYPE_IDS].sort(),
    );
    expect(model.relations).toHaveLength(10);
    const semantic = validateSemanticModel(model);
    expect(semantic.valid).toBe(true);
    const ontology = semanticModelToOntology(model, { ontologyId: "military" });
    expect(validateOntology(ontology).valid).toBe(true);
  });
});
