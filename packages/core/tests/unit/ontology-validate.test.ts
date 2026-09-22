import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseModelYaml,
  semanticModelToOntology,
  validateOntology,
  validateSemanticModel,
} from "../../src/index.js";

const geraceModelPath = path.join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../golden/gerace/model.yaml",
);

describe("validateSemanticModel", () => {
  it("accepts the Gerace golden model", () => {
    const model = parseModelYaml(readFileSync(geraceModelPath, "utf8"));
    const result = validateSemanticModel(model);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("reports broken relation targets", () => {
    const model = parseModelYaml(readFileSync(geraceModelPath, "utf8"));
    model.relations.push({
      ...model.relations[0]!,
      id: "broken-link",
      fromEntity: "missing_entity",
    });
    const result = validateSemanticModel(model);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "broken_relationship_target")).toBe(true);
  });
});

describe("validateOntology", () => {
  it("validates ontology converted from the golden semantic model", () => {
    const model = parseModelYaml(readFileSync(geraceModelPath, "utf8"));
    const ontology = semanticModelToOntology(model, { ontologyId: "gerace" });
    const result = validateOntology(ontology);
    expect(result.valid).toBe(true);
  });

  it("requires enum values when type is enum", () => {
    const result = validateOntology({
      metadata: { formatVersion: "1", id: "test", version: 1 },
      objects: [
        {
          id: "item",
          name: "Item",
          properties: [{ id: "status", name: "Status", type: "enum", role: "primary_key" }],
        },
      ],
      relationships: [],
      logic: [],
      actions: [],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "invalid_property_type")).toBe(true);
  });
});
