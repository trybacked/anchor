import { semanticModelToOntology, type SemanticModel } from "@trybacked/core";
import { legacyDocumentTables } from "@trybacked/capability-documents";
import { describe, expect, it } from "vitest";
import { buildQueryRuntimeFromEnv } from "../../src/env-runtime.js";
const minimalModel: SemanticModel = {
  metadata: {
    formatVersion: "1",
    runId: "run-1",
    generatedAt: new Date().toISOString(),
  },
  entities: [],
  relations: [],
  rules: [],
};
describe("buildQueryRuntimeFromEnv catalog override", () => {
  it("prefers options.catalog over BACKED_CATALOG", async () => {
    const ontology = semanticModelToOntology(minimalModel, { ontologyId: "demo" });
    const executor = async () => [] as Record<string, unknown>[];
    const built = await buildQueryRuntimeFromEnv({
      ontology,
      model: minimalModel,
      executor,
      env: { BACKED_CATALOG: "from_env" },
      catalog: "backed_gerace",
      documentTables: legacyDocumentTables(),
    });
    expect(built.runtime).toBeDefined();
    expect(built.warehouseCapabilities).toBeDefined();
  });
});
