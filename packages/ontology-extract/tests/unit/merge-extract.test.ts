import type { Proposal } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { mergeOntologyExtractIntoProposal } from "../../src/merge-extract.js";
import { parseOntologyExtractOutput } from "../../src/extract-output.js";

const baseline: Proposal = {
  runId: "run-1",
  generatedAt: "2025-01-01T00:00:00.000Z",
  entities: [
    {
      id: "documents",
      name: "documents",
      sourceTable: "cat.docs.documents",
      status: "proposed",
      confidence: 0.9,
      provenance: { table: "cat.docs.documents", evidence: "schema" },
      properties: [
        {
          name: "document_id",
          columnName: "document_id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 0.9,
          provenance: { table: "cat.docs.documents", column: "document_id", evidence: "schema" },
        },
      ],
    },
  ],
  relations: [],
  rules: [],
  doubts: [],
  questions: [],
};

describe("mergeOntologyExtractIntoProposal", () => {
  it("applies entity and property patches from LLM output", () => {
    const extract = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [
          {
            id: "documents",
            name: "Documento",
            description: "File caricato nel corpus",
            properties: [
              {
                columnName: "document_id",
                name: "Id documento",
                semantics: { labels: { it: "identificativo documento" } },
              },
            ],
          },
        ],
        doubts: [
          {
            topic: "doc_type",
            question: "Esistono sotto-tipologie di documento?",
            reason: "Non visibile nelle colonne campionate",
          },
        ],
      }),
    );
    const merged = mergeOntologyExtractIntoProposal(baseline, extract, {
      reviewConfidenceThreshold: 0.85,
    });
    expect(merged.entities[0]?.name).toBe("Documento");
    expect(merged.entities[0]?.properties[0]?.name).toBe("Id documento");
    expect(merged.doubts).toHaveLength(1);
  });
});
