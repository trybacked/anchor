import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { ontologyHasDocumentArchiveEntity } from "../../src/agent/ontology-capabilities.js";

describe("ontologyHasDocumentArchiveEntity", () => {
  it("is false for warehouse-only models", () => {
    const ontology: Ontology = {
      metadata: { id: "t", version: 1 },
      relationships: [],
      objects: [
        { id: "contract", name: "Contract", status: "confirmed", properties: [], relationships: [] },
        {
          id: "organization",
          name: "Organization",
          status: "confirmed",
          properties: [],
          relationships: [],
        },
      ],
    };
    expect(ontologyHasDocumentArchiveEntity(ontology)).toBe(false);
  });

  it("is true when a document entity exists", () => {
    const ontology: Ontology = {
      metadata: { id: "t", version: 1 },
      relationships: [],
      objects: [
        {
          id: "document",
          name: "Document",
          status: "confirmed",
          properties: [],
          relationships: [],
        },
      ],
    };
    expect(ontologyHasDocumentArchiveEntity(ontology)).toBe(true);
  });
});
