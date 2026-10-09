import { describe, expect, it } from "vitest";
import { createChunkSearchReader } from "../../src/readers/chunk-search.js";
import type { DocumentsDatasetResolver } from "../../src/readers/dataset.js";
const documents: DocumentsDatasetResolver = {
  qualifyTable: (name) => `\`backed\`.\`docs\`.\`${name}\``,
  documentsTable: "`backed`.`docs`.`documents`",
  documentElementsTable: "`backed`.`docs`.`document_elements`",
  documentEntitiesTable: "`backed`.`docs`.`document_entities`",
  entityProfilesTable: "`backed`.`docs`.`entity_profiles`",
};
describe("chunk search reader", () => {
  it("runs keyword SQL against document_elements with term-score ordering", async () => {
    const calls: string[] = [];
    const reader = createChunkSearchReader({
      executor: async (sql) => {
        calls.push(sql);
        return [
          {
            element_id: "e1",
            document_id: "d1",
            filename: "a.pdf",
            folder: "contratti",
            element_type: "text",
            page_number: 2,
            element_index: 1,
            content: "pagamenti",
          },
        ];
      },
      documents,
    });
    const rows = await reader({ query: "pagamenti lotti", limit: 5 });
    expect(calls[0]).toContain("document_elements");
    expect(calls[0]).toContain("REPLACE(LOWER(");
    expect(calls[0]).toContain(":term0");
    expect(calls[0]).toContain(":term1");
    expect(calls[0]).toMatch(/ORDER BY `keyword_score` DESC, LENGTH\(`content`\) ASC/);
    expect(rows[0]?.["elementId"]).toBe("e1");
  });

  it("propagates folder and elementTypes filters into the SQL", async () => {
    const calls: { sql: string; parameters: { name: string; value: unknown }[] }[] = [];
    const reader = createChunkSearchReader({
      executor: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return [];
      },
      documents,
    });
    await reader({
      query: "appalti",
      limit: 5,
      folder: ["contratti/2025"],
      elementTypes: ["text", "table"],
    });
    const sql = calls[0]?.sql ?? "";
    expect(sql).toContain("`folder` IN (:folder0)");
    expect(sql).toContain("`element_type` IN (:etype0, :etype1)");
    const names = (calls[0]?.parameters ?? []).map((parameter) => parameter.name);
    expect(names).toContain("folder0");
    expect(names).toContain("etype0");
    expect(names).toContain("etype1");
  });

  it("drops excluded element types from the vector candidate list", async () => {
    const reader = createChunkSearchReader({
      executor: async (sql) =>
        sql.includes("vector_search")
          ? [
              {
                element_id: "keep",
                document_id: "d1",
                element_type: "text",
                content: "appalto",
                score: 0.9,
              },
              {
                element_id: "drop",
                document_id: "d2",
                element_type: "header",
                content: "appalto",
                score: 0.95,
              },
            ]
          : [],
      documents,
      vectorSearchIndex: "idx",
    });
    const rows = await reader({ query: "appalto", limit: 5, excludeElementTypes: ["header"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["elementId"]).toBe("keep");
  });

  it("keeps folder as a post-filter on vector candidates", async () => {
    const reader = createChunkSearchReader({
      executor: async (sql) =>
        sql.includes("vector_search")
          ? [
              {
                element_id: "match",
                document_id: "d1",
                folder: "contratti",
                element_type: "text",
                content: "appalto",
                score: 0.9,
              },
              {
                element_id: "other",
                document_id: "d2",
                folder: "other",
                element_type: "text",
                content: "appalto",
                score: 0.95,
              },
            ]
          : [],
      documents,
      vectorSearchIndex: "idx",
    });
    const rows = await reader({ query: "appalto", limit: 5, folder: ["contratti"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["elementId"]).toBe("match");
  });
});
