import type { SqlParameter } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { createOntologyQueryRuntime } from "../../src/index.js";

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
      ],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

describe("createOntologyQueryRuntime", () => {
  it("compiles, executes, and returns object rows", async () => {
    const executed: { sql: string; parameters: SqlParameter[] }[] = [];
    const runtime = createOntologyQueryRuntime({
      ontology,
      executor: (sql, parameters) => {
        executed.push({ sql, parameters });
        return Promise.resolve([
          { id: 1, city: "Milano" },
          { id: 2, city: "Milano" },
        ]);
      },
    });
    const result = await runtime.queryObjects({
      objectId: "customer",
      filters: [{ propertyId: "city", op: "eq", value: "Milano" }],
      limit: 50,
    });
    expect(executed).toHaveLength(1);
    expect(executed[0]?.sql).toBe(
      "SELECT `id`, `city` FROM `main`.`sales`.`customers` WHERE `city` = :p0 LIMIT 50",
    );
    expect(executed[0]?.parameters).toEqual([{ name: "p0", value: "Milano" }]);
    expect(result).toEqual({
      objectId: "customer",
      columns: ["id", "city"],
      rows: [
        { id: 1, city: "Milano" },
        { id: 2, city: "Milano" },
      ],
      rowCount: 2,
      sql: executed[0]?.sql,
    });
  });

  it("propagates compile errors without touching the executor", async () => {
    let called = false;
    const runtime = createOntologyQueryRuntime({
      ontology,
      executor: () => {
        called = true;
        return Promise.resolve([]);
      },
    });
    await expect(runtime.queryObjects({ objectId: "ghost", filters: [] })).rejects.toThrow(
      /not part of the ontology/,
    );
    expect(called).toBe(false);
  });
});
