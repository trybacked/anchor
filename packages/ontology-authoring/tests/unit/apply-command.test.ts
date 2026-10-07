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
  it("applies applyPack for cov", () => {
    const result = applyCommands(emptySemanticModel("pack-test"), [
      { type: "applyPack", packId: "cov", catalog: "backed_demo" },
    ]);
    expect(result.entities.map((entity) => entity.id).sort()).toEqual([
      "organization",
      "person",
      "person_organization_affiliation",
      "private_organization",
      "public_organization",
      "support_unit",
    ]);
    expect(result.relations).toHaveLength(2);
    expect(result.semantics?.glossary ?? []).toHaveLength(0);
  });
  it("sets property semantics", () => {
    const withPack = applyCommands(emptySemanticModel("sem-test"), [
      { type: "applyPack", packId: "cov", catalog: "backed_demo" },
    ]);
    const updated = applyCommand(withPack, {
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
