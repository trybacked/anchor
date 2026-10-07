import { semanticModelToOntology, validateOntology } from "@trybacked/core";
import { loadBootstrapModel } from "@trybacked/platform-admin";
import { describe, expect, it } from "vitest";

describe("tenant bootstrap model", () => {
  it("is a valid cloud document ontology", () => {
    const model = loadBootstrapModel("demo");
    const ontology = semanticModelToOntology(model, { ontologyId: "demo" });
    const result = validateOntology(ontology);
    expect(result.valid).toBe(true);
    expect(model.entities.map((entity) => entity.id).sort()).toEqual([
      "organization",
      "person",
      "person_organization_affiliation",
      "private_organization",
      "public_organization",
      "support_unit",
    ]);
  });
});
