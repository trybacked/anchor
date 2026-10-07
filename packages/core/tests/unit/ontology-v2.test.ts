import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModelYaml, semanticModelToOntology } from "../../src/index.js";
import { migrateOntologyV1ToV2, type OntologyV2 } from "../../src/ontology/spec-v2.js";
import {
  applyCommandsV2,
  validateOntologyV2,
  type AuthoringCommandV2,
} from "../../src/ontology/spec-v2-authoring.js";
import { describe, expect, it } from "vitest";

const GOLDEN_MODEL_YAML = join(import.meta.dirname, "../golden/gerace/model.yaml");

function loadGoldenOntology() {
  const model = parseModelYaml(readFileSync(GOLDEN_MODEL_YAML, "utf8"));
  return semanticModelToOntology(model, { ontologyId: "gerace" });
}

describe("OntologySpec v2 migration", () => {
  it("migrates the gerace golden ontology deterministically and validates", () => {
    const v1 = loadGoldenOntology();
    const v2 = migrateOntologyV1ToV2(v1);
    expect(v2.metadata.formatVersion).toBe("2");
    expect(v2.objectTypes.map((o) => o.id)).toEqual(v1.objects.map((o) => o.id));
    expect(v2.linkTypes.map((l) => l.id)).toEqual(v1.relationships.map((r) => r.id));
    const result = validateOntologyV2(v2);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    // Deterministic: identical output on re-run.
    expect(migrateOntologyV1ToV2(v1)).toEqual(v2);
  });

  it("applies v2 authoring commands with exhaustive handling", () => {
    const base = migrateOntologyV1ToV2(loadGoldenOntology());
    const commands: AuthoringCommandV2[] = [
      {
        type: "addInterface",
        interface: {
          id: "named_entity",
          name: "Named entity",
          sharedProperties: [
            { id: "display_name", name: "Display name", type: "string", required: true },
          ],
        },
      },
      {
        type: "bindDatasource",
        objectTypeId: "person",
        binding: {
          sourceId: "primary",
          datasetId: base.objectTypes[0]!.backing[0]?.datasetId ?? "catalog.schema.table",
          columnMappings: { name: "name" },
        },
      },
      {
        type: "setObjectTypeSemantics",
        objectTypeId: "person",
        semantics: { displayProperties: ["name"] },
      },
    ];
    const next = applyCommandsV2(base, commands) as OntologyV2;
    expect(next.interfaces.map((i) => i.id)).toContain("named_entity");
    expect(next.objectTypes.find((o) => o.id === "person")?.semantics).toBeDefined();
    expect(validateOntologyV2(next).valid).toBe(true);
  });

  it("reports structural violations as validation errors", () => {
    const base = migrateOntologyV1ToV2(loadGoldenOntology());
    const invalid: OntologyV2 = {
      ...base,
      objectTypes: base.objectTypes.map((o) => ({ ...o, backing: [] })),
    };
    const result = validateOntologyV2(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "object_without_backing")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "property_without_binding")).toBe(true);
  });
});
