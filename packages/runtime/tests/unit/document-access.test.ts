import { describe, expect, it, vi } from "vitest";
import type { DocumentsDatasetResolver } from "../../src/readers/dataset.js";
import { createDocumentAccessReader } from "../../src/readers/document-access.js";
const documents: DocumentsDatasetResolver = {
  qualifyTable: (name) => `\`backed\`.\`docs\`.\`${name}\``,
  documentsTable: "`backed`.`docs`.`documents`",
  documentElementsTable: "`backed`.`docs`.`document_elements`",
  entityProfilesTable: "`backed`.`docs`.`entity_profiles`",
};
describe("createDocumentAccessReader", () => {
  it("loads metadata from docs.documents", async () => {
    const executor = vi.fn(async () => [
      {
        document_id: "abc",
        filename: "contratto.pdf",
        path: "/Volumes/backed_gerace/docs/raw/contratti/contratto.pdf",
        doc_type: "contract",
        page_count: 12,
        folder: "contratti",
      },
    ]);
    const reader = createDocumentAccessReader({ executor, documents });
    const metadata = await reader.getMetadata("abc");
    expect(metadata?.filename).toBe("contratto.pdf");
    expect(metadata?.pageCount).toBe(12);
    expect(metadata?.contentType).toBe("application/pdf");
  });
  it("reads original file bytes via volume reader", async () => {
    const executor = vi.fn(async () => [
      {
        document_id: "abc",
        filename: "contratto.pdf",
        path: "dbfs:/Volumes/backed_gerace/docs/raw/contratti/contratto.pdf",
      },
    ]);
    const readVolumeFile = vi.fn(async () => ({
      status: 200 as const,
      data: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
    }));
    const reader = createDocumentAccessReader({ executor, documents, readVolumeFile });
    const file = await reader.readOriginalFile("abc");
    expect(readVolumeFile).toHaveBeenCalledWith(
      "dbfs:/Volumes/backed_gerace/docs/raw/contratti/contratto.pdf",
      undefined,
    );
    expect(file.contentType).toBe("application/pdf");
  });
});
