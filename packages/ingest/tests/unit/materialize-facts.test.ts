import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureCurrencyFactTypes, extractFactsFromLines, extractMentionsFromLines, } from "../../../semantic/src/index.js";
import { ITALIAN_PA_DETERMINATION_LINES } from "../../../semantic/tests/fixtures/italian-pa-document.js";
import { PROCUREMENT_VOCABULARY } from "../../../semantic/tests/fixtures/vocabulary.js";
import { materializeFacts } from "../../src/materialize-facts.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
describe("materializeFacts", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession({ databasePath: ":memory:" });
    });
    afterEach(async () => {
        await session.close();
    });
    it("materializes Italian PA facts with entity attribution for cloud sync", async () => {
        const vocabulary = ensureCurrencyFactTypes(PROCUREMENT_VOCABULARY, ITALIAN_PA_DETERMINATION_LINES);
        const mentions = extractMentionsFromLines(ITALIAN_PA_DETERMINATION_LINES, vocabulary);
        const facts = extractFactsFromLines(ITALIAN_PA_DETERMINATION_LINES, mentions, vocabulary);
        expect(facts).toHaveLength(7);
        const result = await materializeFacts(session.query, facts);
        expect(result.factCount).toBe(facts.length);
        expect(result.datasetsAdded).toEqual([
            { tableName: "document_facts", sourceFile: "document-facts:extracted", format: "json" },
        ]);
        const rows = await session.query(`SELECT * FROM document_facts ORDER BY page, line`);
        expect(rows.length).toBe(facts.length);
        const withEntity = rows.filter((row) => row["entity_id"] !== null && row["entity_id"] !== undefined);
        expect(withEntity.length).toBeGreaterThanOrEqual(5);
        for (const row of rows) {
            expect(row["fact_id"]).toBeTruthy();
            expect(row["document_id"]).toBe("det_2024_042");
            expect(row["amount"]).not.toBeNull();
        }
        const entityIds = new Set(withEntity.map((row) => String(row["entity_id"])));
        expect(entityIds.has("edil_vincent_srl")).toBe(true);
        expect(entityIds.has("promocost_srl")).toBe(true);
    });
});
