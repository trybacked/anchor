import type { AuthoringCommand } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { applyCommand, applyCommands, emptySemanticModel } from "../../src/apply-command.js";
describe("applyCommand", () => {
  it("adds and removes an entity", () => {
    const base = emptySemanticModel("test-run");
    const add: AuthoringCommand = {
      type: "addEntity",
      entity: {
        id: "item",
        name: "Item",
        sourceTable: "cat.schema.items",
        status: "confirmed",
        confidence: 1,
        provenance: { table: "cat.schema.items", evidence: "test" },
        properties: [
          {
            name: "Id",
            columnName: "id",
            semanticType: "identifier",
            role: "primary_key",
            nullable: false,
            confidence: 1,
            provenance: { table: "cat.schema.items", column: "id", evidence: "pk" },
          },
        ],
      },
    };
    const withEntity = applyCommand(base, add);
    expect(withEntity.entities).toHaveLength(1);
    const removed = applyCommand(withEntity, { type: "removeEntity", entityId: "item" });
    expect(removed.entities).toHaveLength(0);
  });
  it("applies applyPack for anac", () => {
    const result = applyCommands(emptySemanticModel("pack-test"), [
      { type: "applyPack", packId: "anac" },
    ]);
    expect(result.entities.map((entity) => entity.id).sort()).toEqual(["contract", "organization"]);
    expect(result.relations).toHaveLength(1);
    expect(result.semantics?.glossary.length).toBeGreaterThan(0);
  });
  it("sets property semantics", () => {
    const withPack = applyCommands(emptySemanticModel("sem-test"), [
      { type: "applyPack", packId: "anac" },
    ]);
    const updated = applyCommand(withPack, {
      type: "setPropertySemantics",
      entityId: "contract",
      columnName: "source_year_month",
      semantics: { description: "Batch ingest month (YYYY-MM)" },
    });
    const contract = updated.entities.find((entity) => entity.id === "contract");
    const property = contract?.properties.find((entry) => entry.columnName === "source_year_month");
    expect(property?.semantics?.description).toBe("Batch ingest month (YYYY-MM)");
  });
});
