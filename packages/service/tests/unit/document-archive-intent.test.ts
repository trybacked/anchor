import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import {
  documentArchiveTermsFromOntology,
  questionPrefersDocumentArchive,
} from "../../src/document-archive-intent.js";

function ontologyFixture(): Ontology {
  return {
    metadata: {
      id: "t",
      formatVersion: "1",
      version: 1,
      generatedAt: new Date().toISOString(),
    },
    semantics: {
      glossary: [{ id: "g1", term: "Determina", definition: "Atto amministrativo" }],
      examples: [],
    },
    objects: [
      {
        id: "cv",
        name: "Curriculum",
        properties: [],
        semantics: { synonyms: ["cv", "resume"] },
        status: "confirmed",
      },
    ],
    relationships: [],
    logic: [],
    actions: [],
  };
}

describe("documentArchiveTermsFromOntology", () => {
  it("collects glossary, object names, and synonyms", () => {
    const terms = documentArchiveTermsFromOntology(ontologyFixture());
    expect(terms).toContain("determina");
    expect(terms).toContain("curriculum");
    expect(terms).toContain("cv");
    expect(terms).toContain("resume");
  });
});

describe("questionPrefersDocumentArchive", () => {
  it("matches only when ontology terms appear in the question", () => {
    const terms = documentArchiveTermsFromOntology(ontologyFixture());
    expect(questionPrefersDocumentArchive("mostrami il cv di luca", terms)).toBe(true);
    expect(questionPrefersDocumentArchive("quanti contratti attivi?", terms)).toBe(false);
  });
});
