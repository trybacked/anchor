import { describe, expect, it } from "vitest";
import { MODEL_FORMAT_VERSION } from "../../src/constants.js";
import { ModelElementNotFoundError, patchModelElement } from "../../src/model-patch.js";
import type { SemanticModel } from "../../src/model.js";

const baseModel: SemanticModel = {
  metadata: {
    formatVersion: MODEL_FORMAT_VERSION,
    runId: "run-1",
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  entities: [
    {
      id: "entity-1",
      name: "Customer",
      sourceTable: "customers",
      status: "proposed",
      confidence: 0.7,
      provenance: { table: "customers", evidence: "table name" },
      properties: [],
    },
  ],
  relations: [
    {
      id: "relation-1",
      name: "CustomerOrders",
      fromEntity: "entity-1",
      toEntity: "entity-2",
      fromColumn: "id",
      toColumn: "customer_id",
      cardinality: "one_to_many",
      status: "proposed",
      confidence: 0.6,
      provenance: { table: "orders", evidence: "fk" },
    },
  ],
  rules: [
    {
      id: "rule-1",
      name: "PositiveAmount",
      definition: "amount > 0",
      appliesTo: "entity-1",
      status: "proposed",
      confidence: 0.5,
      provenance: { table: "orders", evidence: "values" },
    },
  ],
};

describe("patchModelElement", () => {
  it("confirms a proposed entity", () => {
    const updated = patchModelElement(baseModel, {
      kind: "entity",
      id: "entity-1",
      status: "confirmed",
    });

    expect(updated.entities[0]?.status).toBe("confirmed");
  });

  it("renames an entity when status is renamed", () => {
    const updated = patchModelElement(baseModel, {
      kind: "entity",
      id: "entity-1",
      status: "renamed",
      name: "Client",
    });

    expect(updated.entities[0]?.status).toBe("renamed");
    expect(updated.entities[0]?.name).toBe("Client");
  });

  it("updates relation and rule status", () => {
    const updated = patchModelElement(baseModel, {
      kind: "relation",
      id: "relation-1",
      status: "confirmed",
    });

    expect(updated.relations[0]?.status).toBe("confirmed");

    const withRule = patchModelElement(updated, {
      kind: "rule",
      id: "rule-1",
      status: "confirmed",
    });

    expect(withRule.rules[0]?.status).toBe("confirmed");
  });

  it("throws when the element id is missing", () => {
    expect(() =>
      patchModelElement(baseModel, {
        kind: "entity",
        id: "missing",
        status: "confirmed",
      }),
    ).toThrow(ModelElementNotFoundError);
  });
});
