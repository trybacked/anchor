import { describe, expect, it } from "vitest";
import { createChunkSearchReader } from "../../src/readers/chunk-search.js";
import type { DocumentsDatasetResolver } from "../../src/readers/dataset.js";
const documents: DocumentsDatasetResolver = {
  qualifyTable: (name) => `\`backed\`.\`docs\`.\`${name}\``,
  documentsTable: "`backed`.`docs`.`documents`",
  documentElementsTable: "`backed`.`docs`.`document_elements`",
  entityProfilesTable: "`backed`.`docs`.`entity_profiles`",
};
describe("chunk search reader", () => {
  it("runs keyword SQL against document_elements", async () => {
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
    const rows = await reader({ query: "pagamenti", limit: 5 });
    expect(calls[0]).toContain("document_elements");
    expect(calls[0]).toContain("content");
    expect(rows[0]?.["elementId"]).toBe("e1");
  });
});
