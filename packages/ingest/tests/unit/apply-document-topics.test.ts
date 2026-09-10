import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDocumentTopics } from "../../src/materialize-documents.js";
import { createDuckDbSession } from "../../src/session.js";
import type { DuckDbSession } from "../../src/session.js";
describe("applyDocumentTopics", () => {
    let session: DuckDbSession;
    beforeEach(async () => {
        session = await createDuckDbSession();
        await session.query(`CREATE TABLE doc_determina (
      document_id VARCHAR NOT NULL,
      topics VARCHAR,
      summary VARCHAR,
      page_count INTEGER NOT NULL
    )`);
        await session.query(`INSERT INTO doc_determina VALUES
      ('doc_a', NULL, NULL, 3),
      ('doc_b', NULL, NULL, 2)`);
    });
    afterEach(() => {
        session.close();
    });
    it("writes topics and summary onto the matching document row", async () => {
        const updated = await applyDocumentTopics(session.query, [
            {
                documentId: "doc_a",
                tableName: "doc_determina",
                topics: ["pnrr", "appalto"],
                summary: "Affida i lavori.",
            },
        ]);
        expect(updated).toBe(1);
        const rows = await session.query("SELECT document_id, topics, summary FROM doc_determina ORDER BY document_id");
        expect(rows[0]?.["topics"]).toBe("pnrr, appalto");
        expect(rows[0]?.["summary"]).toBe("Affida i lavori.");
        expect(rows[1]?.["topics"]).toBeNull();
    });
    it("skips documents the LLM did not enrich", async () => {
        const updated = await applyDocumentTopics(session.query, [
            { documentId: "doc_b", tableName: "doc_determina", topics: undefined, summary: undefined },
        ]);
        expect(updated).toBe(0);
    });
    it("supports filtering by topic once applied", async () => {
        await applyDocumentTopics(session.query, [
            { documentId: "doc_a", tableName: "doc_determina", topics: ["pnrr"], summary: "PNRR." },
            { documentId: "doc_b", tableName: "doc_determina", topics: ["tributi"], summary: "IMU." },
        ]);
        const rows = await session.query("SELECT document_id FROM doc_determina WHERE contains(lower(topics), 'pnrr')");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.["document_id"]).toBe("doc_a");
    });
});
