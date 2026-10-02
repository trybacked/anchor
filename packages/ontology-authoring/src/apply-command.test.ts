import { describe, expect, it } from "vitest";
import { applyCommand, applyCommands, emptySemanticModel } from "./apply-command.js";
import type { AuthoringCommand } from "@trybacked/core";

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
  });
});
