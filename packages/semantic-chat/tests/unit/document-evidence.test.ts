import { describe, expect, it } from "vitest";
import {
  chunkMatchesSearchTerms,
  isLikelyRegisterTable,
  rankDocumentSearchRows,
  searchTermsForQuestion,
} from "../../src/document-evidence.js";

describe("document evidence", () => {
  it("derives multi-token search terms from natural questions", () => {
    expect(searchTermsForQuestion("chi è luca tropea")).toEqual(["luca", "tropea"]);
  });

  it("requires every term in multi-token searches", () => {
    expect(chunkMatchesSearchTerms("Comune di San Luca (RC)", ["luca", "tropea"])).toBe(false);
    expect(chunkMatchesSearchTerms("Luca Tropea — software engineer", ["luca", "tropea"])).toBe(true);
  });

  it("detects register tables by content shape", () => {
    const table =
      "N. Impresa Attività Categoria Linea 1 IL GUSTO di Toma Servizio Ristorazione L2 2 DOLCE E SALATO Bar L2";
    expect(isLikelyRegisterTable(table)).toBe(true);
    expect(isLikelyRegisterTable("Luca Tropea — consulenza e sviluppo software")).toBe(false);
  });

  it("ranks CV chunks above register tables for a person question", () => {
    const rows = rankDocumentSearchRows(
      [
        {
          score: 0.9,
          text: "N. Impresa Attività Categoria Linea 1 IL GUSTO di Toma 123 456 L2",
          filename: "prospetto.pdf",
        },
        {
          score: 0.4,
          text: "Luca Tropea | luca@example.com | Esperienze professionali in consulenza",
          filename: "cv.pdf",
        },
      ],
      "chi è luca tropea",
    );
    expect(rows[0]?.filename).toBe("cv.pdf");
  });
});
