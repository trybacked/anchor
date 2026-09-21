import { describe, expect, it } from "vitest";
import {
  applyOntologyGovernancePatch,
  buildGovernanceAuditEvent,
  OntologyGovernanceError,
} from "../../src/index.js";

const baseOntology = {
  metadata: { formatVersion: "1" as const, id: "demo", version: 1 },
  objects: [
    {
      id: "item",
      name: "Item",
      properties: [
        { id: "sku", name: "Sku", type: "string" as const },
        { id: "title", name: "Title", type: "string" as const },
      ],
    },
    {
      id: "legacy_item",
      name: "Legacy Item",
      properties: [{ id: "sku", name: "Sku", type: "string" as const }],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

describe("ontology governance patches", () => {
  it("modifies and removes elements", () => {
    const modified = applyOntologyGovernancePatch(baseOntology, {
      action: "modify",
      elementKind: "object",
      targetId: "item",
      name: "Catalog Item",
    });
    expect(modified.objects[0]?.name).toBe("Catalog Item");
    expect(modified.objects[0]?.source).toBe("manual");

    const removed = applyOntologyGovernancePatch(modified, {
      action: "remove",
      elementKind: "object",
      targetId: "legacy_item",
    });
    expect(removed.objects.some((object) => object.id === "legacy_item")).toBe(false);
  });

  it("merges and splits objects", () => {
    const merged = applyOntologyGovernancePatch(baseOntology, {
      action: "merge",
      elementKind: "object",
      targetId: "item",
      secondaryId: "legacy_item",
    });
    expect(merged.objects).toHaveLength(1);
    expect(merged.objects[0]?.properties).toHaveLength(2);

    const split = applyOntologyGovernancePatch(baseOntology, {
      action: "split",
      elementKind: "object",
      targetId: "item",
      secondaryId: "item_details",
      name: "Item Details",
      payload: { propertyIds: ["title"] },
    });
    expect(split.objects).toHaveLength(3);
    expect(split.objects.find((object) => object.id === "item_details")?.properties).toHaveLength(1);
  });

  it("builds audit events for governance actions", () => {
    const event = buildGovernanceAuditEvent({
      runId: "run-1",
      recordedAt: new Date().toISOString(),
      patch: { action: "add", elementKind: "object", targetId: "new_obj", name: "New" },
      actorId: "tester",
    });
    expect(event.action).toBe("add");
    expect(event.actor?.id).toBe("tester");
  });

  it("rejects invalid split payloads", () => {
    expect(() =>
      applyOntologyGovernancePatch(baseOntology, {
        action: "split",
        elementKind: "object",
        targetId: "item",
        secondaryId: "item_details",
        name: "Item Details",
      }),
    ).toThrow(OntologyGovernanceError);
  });
});
