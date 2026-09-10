import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAggregateReader } from "../../src/aggregate-reader.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
describe("createAggregateReader", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await session.query(`CREATE TABLE entity_profiles (
      name VARCHAR,
      topics VARCHAR,
      total_amount DOUBLE
    )`);
        await session.query(`INSERT INTO entity_profiles VALUES
      ('EDIL VINCENT SRL', 'pnrr, appalto', 350000),
      ('PROMOCOST SRL', 'appalto', 40000),
      ('BETA SRL', 'pnrr', NULL)`);
    });
    afterEach(() => {
        session.close();
    });
    it("sums a numeric column", async () => {
        const reader = createAggregateReader(session.query);
        const value = await reader({
            table: "entity_profiles",
            column: "total_amount",
            op: "sum",
            filters: [],
        });
        expect(value).toBe(390000);
    });
    it("counts rows with filters", async () => {
        const reader = createAggregateReader(session.query);
        const value = await reader({
            table: "entity_profiles",
            column: "name",
            op: "count",
            filters: [{ column: "topics", op: "contains", value: "pnrr" }],
        });
        expect(value).toBe(2);
    });
    it("returns min and max for filtered rows", async () => {
        const reader = createAggregateReader(session.query);
        const min = await reader({
            table: "entity_profiles",
            column: "total_amount",
            op: "min",
            filters: [{ column: "topics", op: "contains", value: "appalto" }],
        });
        const max = await reader({
            table: "entity_profiles",
            column: "total_amount",
            op: "max",
            filters: [{ column: "topics", op: "contains", value: "appalto" }],
        });
        expect(min).toBe(40000);
        expect(max).toBe(350000);
    });
});
