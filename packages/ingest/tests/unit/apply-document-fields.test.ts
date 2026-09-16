import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDocumentFields } from "../../src/apply-document-fields.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";

describe("applyDocumentFields", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await session.query(`CREATE TABLE doc_notice (
      document_id VARCHAR NOT NULL,
      page_count INTEGER NOT NULL
    )`);
        await session.query(`INSERT INTO doc_notice VALUES
      ('doc_a', 3),
      ('doc_b', 2)`);
    });
    afterEach(() => {
        session.close();
    });
    it("writes field values onto the matching document row", async () => {
        const updated = await applyDocumentFields(session.query, [
            {
                documentId: "doc_a",
                tableName: "doc_notice",
                fields: {
                    topics: "infrastructure, procurement",
                    summary: "Awards the contract.",
                },
            },
        ]);
        expect(updated).toBe(1);
        const rows = await session.query("SELECT document_id, topics, summary FROM doc_notice ORDER BY document_id");
        expect(rows[0]?.["topics"]).toBe("infrastructure, procurement");
        expect(rows[0]?.["summary"]).toBe("Awards the contract.");
        expect(rows[1]?.["topics"]).toBeNull();
    });
    it("skips documents with no field updates", async () => {
        const updated = await applyDocumentFields(session.query, [
            { documentId: "doc_b", tableName: "doc_notice", fields: {} },
        ]);
        expect(updated).toBe(0);
    });
    it("adds missing columns before updating enrichment fields", async () => {
        await applyDocumentFields(session.query, [
            { documentId: "doc_a", tableName: "doc_notice", fields: { topics: "infrastructure", summary: "PNRR." } },
            { documentId: "doc_b", tableName: "doc_notice", fields: { topics: "tax", summary: "Levy." } },
        ]);
        const rows = await session.query("SELECT document_id FROM doc_notice WHERE contains(lower(topics), 'infrastructure')");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["document_id"]).toBe("doc_a");
    });
});
