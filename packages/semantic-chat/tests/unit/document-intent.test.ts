import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  documentArchiveTermsFromOntology,
  documentSearchQueries,
  questionPrefersDocumentArchive,
} from "../../src/document-intent.js";

function ontologyWithTerms(): Ontology {
  return {
    metadata: { id: "t", formatVersion: "1", version: 1, runId: "r", generatedAt: new Date().toISOString() },
    objects: [
      {
        id: "cv",
        name: "Curriculum",
        properties: [],
        semantics: { synonyms: ["cv", "resume"] },
        status: "confirmed",
      },
      {
        id: "contract",
        name: "Appalto",
        properties: [],
        status: "confirmed",
      },
    ],
    relationships: [],
    logic: [],
    actions: [],
  };
}

describe("questionPrefersDocumentArchive", () => {
  it("routes via ontology-derived terms, not hardcoded keywords", () => {
    const terms = documentArchiveTermsFromOntology(ontologyWithTerms());
    expect(questionPrefersDocumentArchive("cerca il cv di luca", terms)).toBe(true);
    expect(questionPrefersDocumentArchive("resume tropea", terms)).toBe(true);
    expect(questionPrefersDocumentArchive("parlami dell'appalto 2025", terms)).toBe(true);
  });

  it("defaults to no document routing when the ontology has no terms", () => {
    expect(questionPrefersDocumentArchive("cerca il cv di luca")).toBe(false);
  });

  it("ignores empty questions", () => {
    expect(questionPrefersDocumentArchive("", ["cv"])).toBe(false);
  });
});

describe("documentSearchQueries", () => {
  it("adds name variants and drops short tokens", () => {
    const queries = documentSearchQueries("chi è luca tropea");
    expect(queries).toContain("luca tropea");
    expect(queries).toContain("tropea luca");
    expect(queries).toContain("tropea");
    expect(queries).not.toContain("luca");
  });

  it("keeps name tokens and drops function words", () => {
    const queries = documentSearchQueries("quanti documenti per Tropea nel 2025");
    expect(queries.some((query) => query.toLowerCase().includes("tropea"))).toBe(true);
  });
});