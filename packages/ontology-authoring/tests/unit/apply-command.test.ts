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
  it("sets property semantics", () => {
    const withEntity = applyCommands(emptySemanticModel("sem-test"), [
      {
        type: "addEntity",
        entity: {
          id: "person",
          name: "Person",
          sourceTable: "cat.schema.people",
          status: "confirmed",
          confidence: 1,
          provenance: { table: "cat.schema.people", evidence: "test" },
          properties: [
            {
              name: "Name",
              columnName: "name",
              semanticType: "text",
              role: "attribute",
              nullable: true,
              confidence: 1,
              provenance: { table: "cat.schema.people", column: "name", evidence: "test" },
            },
          ],
        },
      },
    ]);
    const updated = applyCommand(withEntity, {
      type: "setPropertySemantics",
      entityId: "person",
      columnName: "name",
      semantics: { description: "Nome visualizzato" },
    });
    const person = updated.entities.find((entity) => entity.id === "person");
    const property = person?.properties.find((entry) => entry.columnName === "name");
    expect(property?.semantics?.description).toBe("Nome visualizzato");
  });
});
