import type { SqlParameter } from "@trybacked/compiler";
import { describe, expect, it } from "vitest";
import { createOntologyQueryRuntime } from "../../src/index.js";
import { procurementOntology } from "../fixtures/procurement-ontology.js";

describe("createOntologyQueryRuntime joins", () => {
  it("executes compiled join SQL and returns rows", async () => {
    const executed: { sql: string; parameters: SqlParameter[] }[] = [];
    const runtime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor: (sql, parameters) => {
        executed.push({ sql, parameters });
        return Promise.resolve([{ cig: "ABC123", oggetto_gara: "Servizi" }]);
      },
    });
    const result = await runtime.queryObjects({
      objectId: "contract",
      joins: [{ relationshipId: "project_has_contracts" }],
      filters: [{ objectId: "project", propertyId: "name", op: "eq", value: "Alpha" }],
      limit: 5,
    });
    expect(executed).toHaveLength(1);
    expect(executed[0]?.sql).toContain("EXISTS (SELECT 1 FROM `backed`.`docs`.`projects` AS `o1`");
    expect(executed[0]?.parameters).toEqual([{ name: "p0", value: "Alpha" }]);
    expect(result.objectId).toBe("contract");
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toEqual({ cig: "ABC123", oggetto_gara: "Servizi" });
  });

  it("executes count mode without row limit enforcement in runtime", async () => {
    const runtime = createOntologyQueryRuntime({
      ontology: procurementOntology,
      executor: () => Promise.resolve([{ count: 42 }]),
    });
    const result = await runtime.queryObjects({
      objectId: "contract",
      joins: [{ relationshipId: "organization_has_contracts" }],
      mode: "count",
    });
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toEqual({ count: 42 });
  });
});
