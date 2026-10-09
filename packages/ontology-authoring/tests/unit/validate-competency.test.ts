import {
  MODEL_FORMAT_VERSION,
  semanticModelToOntology,
  type SemanticModel,
  type VerifiedExample,
} from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { validateAuthoringModel } from "../../src/validate-authoring.js";
import { validateCompetencyExamples } from "../../src/validate-competency.js";

function modelWithExamples(examples: VerifiedExample[]): SemanticModel {
  return {
    metadata: {
      formatVersion: MODEL_FORMAT_VERSION,
      runId: "run-competency",
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
    entities: [
      {
        id: "contract",
        name: "Contract",
        sourceTable: "backed_gerace.docs.contract",
        status: "confirmed",
        confidence: 1,
        provenance: { table: "backed_gerace.docs.contract", evidence: "test" },
        properties: [
          {
            name: "Cig",
            columnName: "cig",
            semanticType: "identifier",
            role: "primary_key",
            nullable: false,
            confidence: 1,
            provenance: {
              table: "backed_gerace.docs.contract",
              column: "cig",
              evidence: "pk",
            },
          },
          {
            name: "Load Month",
            columnName: "load_month",
            semanticType: "text",
            role: "attribute",
            nullable: false,
            confidence: 1,
            provenance: {
              table: "backed_gerace.docs.contract",
              column: "load_month",
              evidence: "column",
            },
          },
        ],
      },
    ],
    relations: [],
    rules: [],
    semantics: {
      glossary: [],
      examples,
    },
  };
}

const VALID_QUERY = {
  objectId: "contract",
  mode: "count",
  filters: [{ propertyId: "load_month", op: "eq", value: "2025-06" }],
};

const RENAMED_QUERY = {
  objectId: "contract",
  mode: "count",
  filters: [{ propertyId: "load_moth", op: "eq", value: "2025-06" }],
};

describe("validateCompetencyExamples", () => {
  it("accepts examples whose expectedObjectQuery compiles", () => {
    const model = modelWithExamples([
      { id: "ex-1", question: "Quanti a giugno?", expectedObjectQuery: VALID_QUERY },
    ]);
    const ontology = semanticModelToOntology(model, { ontologyId: "test" });
    expect(validateCompetencyExamples(model, ontology)).toEqual([]);
  });

  it("rejects a renamed property with a suggestion", () => {
    const model = modelWithExamples([
      { id: "ex-1", question: "Quanti a giugno?", expectedObjectQuery: RENAMED_QUERY },
    ]);
    const result = validateAuthoringModel(model, "test");
    expect(result.valid).toBe(false);
    const issue = result.issues.find((entry) => entry.code === "invalid_competency_query");
    expect(issue?.severity).toBe("error");
    expect(issue?.path).toBe("semantics.examples[0].expectedObjectQuery");
    expect(issue?.message).toContain("load_month");
  });

  it("rejects a malformed query shape", () => {
    const model = modelWithExamples([
      { id: "ex-1", question: "Broken", expectedObjectQuery: { objectId: 42 } },
    ]);
    const result = validateAuthoringModel(model, "test");
    expect(result.valid).toBe(false);
    const issue = result.issues.find((entry) => entry.code === "invalid_competency_query");
    expect(issue?.message).toContain("objectId");
  });

  it("ignores examples without expectedObjectQuery", () => {
    const model = modelWithExamples([{ id: "ex-1", question: "Free-form example" }]);
    expect(validateAuthoringModel(model, "test").valid).toBe(true);
  });
});
