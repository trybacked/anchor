import type { SemanticModel } from "@backed/core";
import { describe, expect, it } from "vitest";

import { getEntity, listEntities, listRelations, searchModel } from "./mapping.js";

const MODEL: SemanticModel = {
  metadata: {
    formatVersion: "1",
    runId: "run-1",
    generatedAt: "2026-09-03T12:00:00.000Z",
  },
  entities: [
    {
      id: "cliente",
      name: "Cliente",
      description: "Anagrafica dei clienti.",
      sourceTable: "clienti",
      status: "confirmed",
      confidence: 0.95,
      provenance: { table: "clienti", evidence: "test" },
      properties: [
        {
          name: "Partita IVA",
          columnName: "partita_iva",
          semanticType: "vat_number",
          role: "attribute",
          nullable: false,
          confidence: 0.98,
          provenance: { table: "clienti", column: "partita_iva", evidence: "pattern" },
        },
      ],
    },
    {
      id: "fattura",
      name: "Fattura",
      sourceTable: "fatture",
      status: "confirmed",
      confidence: 0.9,
      provenance: { table: "fatture", evidence: "test" },
      properties: [],
    },
  ],
  relations: [
    {
      id: "fattura-cliente",
      name: "Fattura emessa a Cliente",
      fromEntity: "fattura",
      toEntity: "cliente",
      fromColumn: "cliente_id",
      toColumn: "id",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 0.9,
      provenance: { table: "fatture", column: "cliente_id", evidence: "test" },
    },
  ],
  rules: [
    {
      id: "fattura-insoluta",
      name: "Fattura insoluta",
      definition: 'Una fattura è insoluta quando lo stato vale "insoluta".',
      appliesTo: "fattura",
      column: "stato",
      status: "confirmed",
      confidence: 0.8,
      provenance: { table: "fatture", column: "stato", evidence: "test" },
    },
  ],
  actions: [],
};

describe("mapping", () => {
  it("lists entity summaries", () => {
    const entities = listEntities(MODEL);
    expect(entities).toHaveLength(2);
    expect(entities[0]).toEqual({
      id: "cliente",
      name: "Cliente",
      description: "Anagrafica dei clienti.",
      sourceTable: "clienti",
      status: "confirmed",
      confidence: 0.95,
    });
  });

  it("returns entity detail with its relations and rules", () => {
    const detail = getEntity(MODEL, "fattura");
    expect(detail?.entity.name).toBe("Fattura");
    expect(detail?.relations.map((relation) => relation.id)).toEqual(["fattura-cliente"]);
    expect(detail?.rules.map((rule) => rule.id)).toEqual(["fattura-insoluta"]);
  });

  it("returns null for an unknown entity", () => {
    expect(getEntity(MODEL, "magazzino")).toBeNull();
  });

  it("lists relations", () => {
    expect(listRelations(MODEL)).toHaveLength(1);
  });

  it("searches case-insensitively across entities, properties, relations and rules", () => {
    const byProperty = searchModel(MODEL, "PARTITA iva");
    expect(byProperty.map((match) => match.kind)).toContain("property");

    const byRule = searchModel(MODEL, "insoluta");
    expect(byRule.some((match) => match.kind === "rule")).toBe(true);

    const byRelation = searchModel(MODEL, "emessa");
    expect(byRelation.some((match) => match.kind === "relation")).toBe(true);

    expect(searchModel(MODEL, "  ")).toHaveLength(0);
    expect(searchModel(MODEL, "inesistente")).toHaveLength(0);
  });
});
