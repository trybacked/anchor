import { parseModelYaml, semanticModelToOntology, validateOntology } from "@trybacked/core";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
describe("tenant bootstrap model", () => {
  it("is a valid ontology for sync", () => {
    const assetPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../src/tenant/minimal-tenant-docs.model.yaml",
    );
    const model = parseModelYaml(
      readFileSync(assetPath, "utf8").replaceAll("__TENANT_CATALOG__", "backed_demo"),
    );
    const ontology = semanticModelToOntology(model, { ontologyId: "demo" });
    const result = validateOntology(ontology);
    expect(result.valid).toBe(true);
    expect(model.entities.length).toBeGreaterThanOrEqual(2);
  });
});
