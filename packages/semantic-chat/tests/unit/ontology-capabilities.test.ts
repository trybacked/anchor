import { describe, expect, it } from "vitest";
import { ontologyHasDocumentArchiveEntity } from "../../src/agent/ontology-capabilities.js";
import { contractOntology } from "./agent-fixtures.js";

describe("ontologyHasDocumentArchiveEntity", () => {
  it("is false for warehouse-only models", () => {
    expect(ontologyHasDocumentArchiveEntity(contractOntology())).toBe(false);
  });

  it("is true when a document entity exists", () => {
    const ontology = contractOntology();
    ontology.objects.push({ id: "document", name: "Document", properties: [] });
    expect(ontologyHasDocumentArchiveEntity(ontology)).toBe(true);
  });
});
