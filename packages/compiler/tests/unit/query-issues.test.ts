import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { compileObjectQuery, ObjectQueryCompileError } from "../../src/index.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.contracts",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        { id: "importo_lotto", name: "Importo lotto", type: "float", role: "attribute" },
        { id: "oggetto", name: "Oggetto", type: "string", role: "attribute" },
      ],
    },
    {
      id: "organization",
      name: "Organization",
      sourceDatasetId: "demo.organizations",
      properties: [
        { id: "denominazione", name: "Denominazione", type: "string", role: "attribute" },
      ],
    },
  ],
  relationships: [
    {
      id: "organization_has_contracts",
      name: "Organization has contracts",
      fromObjectId: "organization",
      toObjectId: "contract",
      fromPropertyId: "denominazione",
      toPropertyId: "cig",
      cardinality: "one_to_many",
    },
  ],
  logic: [],
  actions: [],
};

describe("compile error QueryIssue payloads", () => {
  it("unknown object carries allowed ids and suggestions", () => {
    expect(() => compileObjectQuery(ontology, { objectId: "contrat" } as never)).toThrowError(
      ObjectQueryCompileError,
    );
    try {
      compileObjectQuery(ontology, { objectId: "contrat" } as never);
    } catch (error) {
      const issue = (error as ObjectQueryCompileError).issue;
      expect(issue.code).toBe("unknown_object");
      expect(issue.path).toBe("objectId");
      expect(issue.invalidValue).toBe("contrat");
      expect(issue.allowed).toContain("contract");
      expect(issue.suggestions).toEqual(["contract"]);
    }
  });

  it("unknown property suggests the closest id and lists allowed ones", () => {
    try {
      compileObjectQuery(ontology, {
        objectId: "contract",
        filters: [{ propertyId: "importo", op: "gt", value: 1000 }],
      } as never);
      expect.unreachable("expected compile to throw");
    } catch (error) {
      const issue = (error as ObjectQueryCompileError).issue;
      expect(issue.code).toBe("unknown_property");
      expect(issue.suggestions).toEqual(["importo_lotto"]);
      expect(issue.allowed).toContain("cig");
    }
  });

  it("unknown relationship suggests the closest one", () => {
    try {
      compileObjectQuery(ontology, {
        objectId: "organization",
        joins: [{ relationshipId: "organization_has_contrat" }],
      } as never);
      expect.unreachable("expected compile to throw");
    } catch (error) {
      const issue = (error as ObjectQueryCompileError).issue;
      expect(issue.code).toBe("unknown_relationship");
      expect(issue.path).toBe("joins.relationshipId");
      expect(issue.suggestions).toEqual(["organization_has_contracts"]);
    }
  });

  it("invalid orderBy on grouped queries lists the projected columns", () => {
    try {
      compileObjectQuery(ontology, {
        objectId: "contract",
        aggregations: [{ op: "count", alias: "count" }],
        groupBy: ["cig"],
        orderBy: "importooo",
      } as never);
      expect.unreachable("expected compile to throw");
    } catch (error) {
      const issue = (error as ObjectQueryCompileError).issue;
      expect(issue.code).toBe("invalid_order_by");
      expect(issue.allowed).toEqual(["cig", "count"]);
    }
  });

  it("orderBy typo on plain rows suggests the property id", () => {
    try {
      compileObjectQuery(ontology, {
        objectId: "contract",
        orderBy: "impotno_lotto",
      } as never);
      expect.unreachable("expected compile to throw");
    } catch (error) {
      const issue = (error as ObjectQueryCompileError).issue;
      expect(issue.code).toBe("invalid_order_by");
      expect(issue.path).toBe("orderBy");
      expect(issue.suggestions).toEqual(["importo_lotto"]);
    }
  });
});
