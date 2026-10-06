import { describe, expect, it } from "vitest";
import {
  documentSearchQueries,
  questionPrefersDocumentArchive,
} from "../../src/document-intent.js";

describe("questionPrefersDocumentArchive", () => {
  it("detects CV queries", () => {
    expect(questionPrefersDocumentArchive("cv tropea luca")).toBe(true);
    expect(questionPrefersDocumentArchive("curriculum vitae")).toBe(true);
  });

  it("keeps procurement questions on warehouse", () => {
    expect(questionPrefersDocumentArchive("gare con oggetto Luca Tropea")).toBe(false);
    expect(questionPrefersDocumentArchive("quanti appalti nel 2025")).toBe(false);
  });

  it("does not treat general Q&A as file-list archive", () => {
    expect(questionPrefersDocumentArchive("Luca Tropea")).toBe(false);
    expect(questionPrefersDocumentArchive("chi è luca tropea")).toBe(false);
  });
});

describe("documentSearchQueries", () => {
  it("strips stopwords and adds name variants without overly broad single tokens", () => {
    const queries = documentSearchQueries("chi è luca tropea");
    expect(queries).toContain("luca tropea");
    expect(queries).toContain("tropea luca");
    expect(queries).toContain("tropea");
    expect(queries).not.toContain("luca");
  });
});
