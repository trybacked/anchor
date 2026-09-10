import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRowReader } from "../../src/row-reader.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
describe("createRowReader", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await session.query(`CREATE TABLE entity_profiles (
      name VARCHAR,
      topics VARCHAR,
      document_ids VARCHAR,
      total_amount DOUBLE
    )`);
        await session.query(`INSERT INTO entity_profiles VALUES
      ('EDIL VINCENT SRL', 'pnrr, appalto', 'doc_a, doc_b', 350000),
      ('PROMOCOST SRL', 'appalto', 'doc_a', 40000)`);
    });
    afterEach(() => {
        session.close();
    });
    it("projects only the requested columns", async () => {
        const reader = createRowReader(session.query);
        const rows = await reader({
            table: "entity_profiles",
            filters: [],
            columns: ["name", "total_amount"],
            limit: 10,
        });
        expect(Object.keys(rows[0] ?? {})).toEqual(["name", "total_amount"]);
    });
    it("returns every column when no projection is given", async () => {
        const reader = createRowReader(session.query);
        const rows = await reader({ table: "entity_profiles", filters: [], limit: 10 });
        expect(Object.keys(rows[0] ?? {})).toContain("document_ids");
    });
    it("matches multi-value text columns with the contains operator", async () => {
        const reader = createRowReader(session.query);
        const rows = await reader({
            table: "entity_profiles",
            filters: [{ column: "topics", op: "contains", value: "PNRR" }],
            columns: ["name"],
            limit: 10,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["name"]).toBe("EDIL VINCENT SRL");
    });
});
