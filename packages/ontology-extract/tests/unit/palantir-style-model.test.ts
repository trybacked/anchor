import { validateSemanticModel } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { buildPalantirStyleDocumentSemanticModel } from "../../src/foundry/palantir-style-model.js";

describe("buildPalantirStyleDocumentSemanticModel", () => {
  it("exposes core object types and semantic links, not warehouse junction tables", () => {
    const model = buildPalantirStyleDocumentSemanticModel({
      catalog: "backed_leonardo",
      runId: "run-palantir",
      generatedAt: new Date("2026-10-09T12:00:00.000Z").toISOString(),
      tablesWithRows: new Set([
        "documents",
        "organization_profiles",
        "person_profiles",
        "document_organization_mentions",
      ]),
    });
    expect(model.entities.map((entity) => entity.id).sort()).toEqual(
      ["document", "organization", "person"].sort(),
    );
    expect(model.entities.some((entity) => entity.id.includes("mention"))).toBe(false);
    expect(model.relations.some((relation) => relation.name === "Mentions organization")).toBe(true);
    const validation = validateSemanticModel(model);
    expect(validation.valid).toBe(true);
  });
});
