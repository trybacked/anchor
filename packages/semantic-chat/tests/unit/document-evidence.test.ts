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

  it("drops function words", () => {
    expect(searchTermsForQuestion("quanti documenti per Luca")).toEqual(["documenti", "luca"]);
  });

  it("requires every term in multi-token searches", () => {
    expect(chunkMatchesSearchTerms("Comune di San Luca (RC)", ["luca", "tropea"])).toBe(false);
    expect(chunkMatchesSearchTerms("Luca Tropea — software engineer", ["luca", "tropea"])).toBe(true);
  });

  it("detects register tables by digit density, not domain wording", () => {
    const table =
      "Riga Importo Quantita 1 1234 5678 2 2345 6789 3 3456 7890 4 4567 8901 5 5678 9012";
    expect(isLikelyRegisterTable(table)).toBe(true);
    expect(isLikelyRegisterTable("Luca Tropea — consulenza e sviluppo software")).toBe(false);
  });

  it("ranks prose chunks above register tables for a person question", () => {
    const rows = rankDocumentSearchRows(
      [
        {
          score: 0.9,
          text: "Riga Importo Quantita 1 1234 5678 2 2345 6789 3 3456 7890 4 4567 8901",
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