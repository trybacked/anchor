import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createObjectQueryReader } from "../../src/object-query-reader.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
describe("createObjectQueryReader", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await session.query(`CREATE TABLE document_facts (
      document_id VARCHAR,
      entity_id VARCHAR,
      fact_type VARCHAR,
      amount DOUBLE
    )`);
        await session.query(`INSERT INTO document_facts VALUES
      ('doc-1', 'supplier-a', 'liquidazione', 1000),
      ('doc-1', 'supplier-a', 'impegno', 500),
      ('doc-2', 'supplier-b', 'liquidazione', 2500),
      ('doc-2', 'supplier-c', 'liquidazione', 750)`);
    });
    afterEach(() => {
        session.close();
    });
    it("groups sum and count by entity_id", async () => {
        const reader = createObjectQueryReader(session.query);
        const rows = await reader({
            table: "document_facts",
            filters: [],
            aggregations: [
                { op: "sum", column: "amount", alias: "total_amount" },
                { op: "count", alias: "fact_count" },
            ],
            groupBy: ["entity_id"],
            orderBy: "total_amount",
            orderDirection: "desc",
            limit: 10,
        });
        expect(rows).toEqual([
            { entity_id: "supplier-b", total_amount: 2500, fact_count: 1 },
            { entity_id: "supplier-a", total_amount: 1500, fact_count: 2 },
            { entity_id: "supplier-c", total_amount: 750, fact_count: 1 },
        ]);
    });
    it("applies filters before grouping", async () => {
        const reader = createObjectQueryReader(session.query);
        const rows = await reader({
            table: "document_facts",
            filters: [{ column: "fact_type", op: "=", value: "liquidazione" }],
            aggregations: [{ op: "sum", column: "amount", alias: "total_amount" }],
            groupBy: ["entity_id"],
            orderBy: "total_amount",
            orderDirection: "desc",
            limit: 10,
        });
        expect(rows).toEqual([
            { entity_id: "supplier-b", total_amount: 2500 },
            { entity_id: "supplier-a", total_amount: 1000 },
            { entity_id: "supplier-c", total_amount: 750 },
        ]);
    });
});
