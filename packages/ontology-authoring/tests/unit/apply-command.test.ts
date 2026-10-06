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
  it("applies applyPack for docs", () => {
    const result = applyCommands(emptySemanticModel("pack-test"), [
      { type: "applyPack", packId: "docs", catalog: "backed_demo" },
    ]);
    expect(result.entities.map((entity) => entity.id).sort()).toEqual([
      "document",
      "document_element",
      "person",
    ]);
    expect(result.relations).toHaveLength(1);
  });
  it("sets property semantics", () => {
    const withPack = applyCommands(emptySemanticModel("sem-test"), [
      { type: "applyPack", packId: "docs", catalog: "backed_demo" },
    ]);
    const updated = applyCommand(withPack, {
      type: "setPropertySemantics",
      entityId: "document",
      columnName: "filename",
      semantics: { description: "Original file name" },
    });
    const document = updated.entities.find((entity) => entity.id === "document");
    const property = document?.properties.find((entry) => entry.columnName === "filename");
    expect(property?.semantics?.description).toBe("Original file name");
  });
});
