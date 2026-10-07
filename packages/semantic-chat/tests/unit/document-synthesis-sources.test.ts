import { describe, expect, it } from "vitest";
import {
  buildDocumentSourcesFromGroups,
  formatDocumentSourceTitle,
  groupEvidenceByDocument,
} from "../../src/document-synthesis.js";

describe("document synthesis sources", () => {
  it("groups chunks by document and keeps the richest excerpt", () => {
    const groups = groupEvidenceByDocument([
      {
        documentId: "doc-a",
        filename: "luca_tropea_cv.pdf",
        folder: "contratti",
        page: 1,
        text: "Luca Tropea — breve",
      },
      {
        documentId: "doc-a",
        filename: "luca_tropea_cv.pdf",
        folder: "contratti",
        page: 2,
        text: "Luca Tropea — telefono +39 388 906 2867, email luca@versadia.dev",
      },
      {
        documentId: "doc-b",
        filename: "carriera-universitaria-0312501239_1.pdf",
        folder: "contratti",
        page: 1,
        text: "Matricola 0312501239",
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.excerpt).toContain("telefono");
    expect(formatDocumentSourceTitle(groups[0]!)).toBe("luca_tropea_cv.pdf · contratti");
  });

  it("builds structured sources for the client", () => {
    const sources = buildDocumentSourcesFromGroups([
      {
        documentId: "doc-a",
        filename: "tropea-luca-cv.pdf",
        folder: "contratti",
        page: 3,
        excerpt: "Profilo professionale e competenze tecniche.",
      },
    ]);
    expect(sources[0]).toMatchObject({
      title: "tropea-luca-cv.pdf · contratti",
      documentId: "doc-a",
      page: 3,
      folder: "contratti",
      snippet: "Profilo professionale e competenze tecniche.",
    });
  });
});
