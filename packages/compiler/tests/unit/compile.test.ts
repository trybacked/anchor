import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { ObjectQueryCompileError, compileObjectQuery } from "../../src/index.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "customer",
      name: "Customer",
      sourceDatasetId: "main.sales.customers",
      properties: [
        { id: "id", name: "Id", type: "integer", role: "primary_key" },
        { id: "city", name: "City", type: "string" },
        { id: "active", name: "Active", type: "boolean" },
      ],
    },
    {
      id: "unmapped",
      name: "Unmapped",
      properties: [{ id: "id", name: "Id", type: "integer" }],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

describe("compileObjectQuery", () => {
  it("compiles a filtered query into parameterized SQL", () => {
    const compiled = compileObjectQuery(ontology, {
      objectId: "customer",
      filters: [
        { propertyId: "city", op: "eq", value: "Milano" },
        { propertyId: "id", op: "gte", value: 100 },
      ],
      limit: 10,
    });
    expect(compiled.sql).toBe(
      "SELECT `id`, `city`, `active` FROM `main`.`sales`.`customers` WHERE `city` = :p0 AND `id` >= :p1 LIMIT 10",
    );
    expect(compiled.parameters).toEqual([
      { name: "p0", value: "Milano" },
      { name: "p1", value: 100 },
    ]);
    expect(compiled.columns).toEqual(["id", "city", "active"]);
  });

  it("applies the default limit and no WHERE clause without filters", () => {
    const compiled = compileObjectQuery(ontology, { objectId: "customer", filters: [] });
    expect(compiled.sql).toBe(
      "SELECT `id`, `city`, `active` FROM `main`.`sales`.`customers` LIMIT 100",
    );
    expect(compiled.parameters).toEqual([]);
  });

  it("compiles count mode without a row limit", () => {
    const compiled = compileObjectQuery(ontology, {
      objectId: "customer",
      filters: [{ propertyId: "city", op: "eq", value: "Milano" }],
      mode: "count",
    });
    expect(compiled.sql).toBe(
      "SELECT COUNT(*) AS `count` FROM `main`.`sales`.`customers` WHERE `city` = :p0",
    );
    expect(compiled.columns).toEqual(["count"]);
    expect(compiled.parameters).toEqual([{ name: "p0", value: "Milano" }]);
  });

  it("compiles null filters as IS NULL / IS NOT NULL", () => {
    const compiled = compileObjectQuery(ontology, {
      objectId: "customer",
      filters: [
        { propertyId: "city", op: "eq", value: null },
        { propertyId: "active", op: "neq", value: null },
      ],
    });
    expect(compiled.sql).toContain("WHERE `city` IS NULL AND `active` IS NOT NULL");
    expect(compiled.parameters).toEqual([]);
  });

  it("escapes backticks in identifiers", () => {
    const hostile: Ontology = {
      ...ontology,
      objects: [
        {
          id: "odd",
          name: "Odd",
          sourceDatasetId: "main.we`ird",
          properties: [{ id: "co`l", name: "Col", type: "string" }],
        },
      ],
    };
    const compiled = compileObjectQuery(hostile, { objectId: "odd", filters: [] });
    expect(compiled.sql).toBe("SELECT `co``l` FROM `main`.`we``ird` LIMIT 100");
  });

  it("rejects unknown objects", () => {
    expect(() => compileObjectQuery(ontology, { objectId: "ghost", filters: [] })).toThrowError(
      ObjectQueryCompileError,
    );
    expect(() => compileObjectQuery(ontology, { objectId: "ghost", filters: [] })).toThrow(
      /not part of the ontology/,
    );
  });

  it("rejects objects without a dataset mapping", () => {
    expect(() => compileObjectQuery(ontology, { objectId: "unmapped", filters: [] })).toThrow(
      /no backing dataset mapping/,
    );
  });

  it("rejects filters on unknown properties", () => {
    expect(() =>
      compileObjectQuery(ontology, {
        objectId: "customer",
        filters: [{ propertyId: "ghost", op: "eq", value: "x" }],
      }),
    ).toThrow(/not part of object/);
  });

  it("rejects null with ordering operators", () => {
    expect(() =>
      compileObjectQuery(ontology, {
        objectId: "customer",
        filters: [{ propertyId: "id", op: "gt", value: null }],
      }),
    ).toThrow(/does not accept null/);
  });

  it("rejects limits above the maximum", () => {
    expect(() =>
      compileObjectQuery(ontology, { objectId: "customer", filters: [], limit: 100000 }),
    ).toThrow();
  });
});
