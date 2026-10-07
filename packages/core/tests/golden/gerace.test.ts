import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseModelYaml, semanticModelToOntology, SemanticModelSchema, validateOntology } from "../../src/index.js";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "gerace");

interface GeraceGoldenManifest {
  corpus: string;
  formatVersion: string;
  entityCount: number;
  relationCount: number;
  ruleCount: number;
  entityIds: string[];
  documentTypeEntityIds: string[];
}

function loadManifest(): GeraceGoldenManifest {
  return JSON.parse(
    readFileSync(join(GOLDEN_DIR, "manifest.json"), "utf8"),
  ) as GeraceGoldenManifest;
}

function loadGoldenModel() {
  return parseModelYaml(readFileSync(join(GOLDEN_DIR, "model.yaml"), "utf8"));
}

describe("Gerace golden model.yaml", () => {
  const manifest = loadManifest();

  it("parses and validates against SemanticModelSchema", () => {
    const model = loadGoldenModel();
    expect(() => SemanticModelSchema.parse(model)).not.toThrow();
    const ontology = semanticModelToOntology(model, { ontologyId: "gerace" });
    expect(validateOntology(ontology).valid).toBe(true);
  });

  it("matches golden manifest structure", () => {
    const model = loadGoldenModel();
    expect(model.metadata.formatVersion).toBe(manifest.formatVersion);
    expect(model.entities).toHaveLength(manifest.entityCount);
    expect(model.relations).toHaveLength(manifest.relationCount);
    expect(model.rules).toHaveLength(manifest.ruleCount);
    expect(model.entities.map((entity) => entity.id).sort()).toEqual(
      [...manifest.entityIds].sort(),
    );
  });

  it("has no legacy doc-type entities", () => {
    const model = loadGoldenModel();
    const ids = model.entities.map((entity) => entity.id);
    expect(ids).not.toContain("document");
    expect(ids).not.toContain("document_element");
    expect(ids).not.toContain("determina");
    expect(manifest.documentTypeEntityIds).toHaveLength(0);
  });

  it("maps person and organization link types", () => {
    const model = loadGoldenModel();
    const relationIds = model.relations.map((relation) => relation.id).sort();
    expect(relationIds).toEqual(["affiliation_to_organization", "affiliation_to_person"]);
  });
});
