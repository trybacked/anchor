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
    expect(merged.entities[0]?.provenance.method).toBe("llm");
    expect(merged.doubts).toHaveLength(1);
  });

  it("rejects LLM relations whose columns do not exist and records a doubt", () => {
    const extract = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [],
        relations: [
          {
            id: "rel-ghost",
            name: "Documento → Committente",
            fromEntity: "documents",
            toEntity: "documents",
            fromColumn: "ghost_column",
            toColumn: "document_id",
            cardinality: "many_to_one",
          },
        ],
      }),
    );
    const merged = mergeOntologyExtractIntoProposal(baseline, extract, {
      reviewConfidenceThreshold: 0.85,
    });
    expect(merged.relations).toHaveLength(0);
    expect(merged.doubts).toHaveLength(1);
    expect(merged.doubts[0]?.topic).toBe("relation:rel-ghost");
    expect(merged.doubts[0]?.reason).toContain("ghost_column");
  });

  it("caps LLM relation confidence at the profile FK evidence and marks provenance llm", () => {
    const withFk: Proposal = {
      ...baseline,
      entities: [
        {
          ...baseline.entities[0]!,
          properties: [
            ...baseline.entities[0]!.properties,
            {
              name: "Committente",
              columnName: "customer_id",
              semanticType: "identifier",
              role: "foreign_key",
              nullable: false,
              confidence: 0.9,
              provenance: {
                table: "cat.docs.documents",
                column: "customer_id",
                evidence: "overlap=0.900",
                method: "profile",
              },
            },
          ],
        },
      ],
    };
    const extract = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [],
        relations: [
          {
            id: "rel-doc-customer",
            name: "Documento → Committente",
            fromEntity: "documents",
            toEntity: "documents",
            fromColumn: "customer_id",
            toColumn: "document_id",
            cardinality: "many_to_one",
            confidence: 0.95,
          },
        ],
      }),
    );
    const merged = mergeOntologyExtractIntoProposal(withFk, extract, {
      reviewConfidenceThreshold: 0.85,
    });
    const relation = merged.relations.find((entry) => entry.id === "rel-doc-customer");
    expect(relation?.confidence).toBe(0.9);
    expect(relation?.provenance.method).toBe("llm");
  });

  it("downgrades relations on below-threshold profile overlap to review doubts", () => {
    const weakFk: Proposal = {
      ...baseline,
      entities: [
        {
          ...baseline.entities[0]!,
          properties: [
            ...baseline.entities[0]!.properties,
            {
              name: "Committente",
              columnName: "customer_id",
              semanticType: "identifier",
              role: "foreign_key",
              nullable: false,
              confidence: 0.5,
              provenance: {
                table: "cat.docs.documents",
                column: "customer_id",
                evidence: "overlap=0.500",
                method: "profile",
              },
            },
          ],
        },
      ],
    };
    const extract = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [],
        relations: [
          {
            id: "rel-weak",
            name: "Documento → Committente",
            fromEntity: "documents",
            toEntity: "documents",
            fromColumn: "customer_id",
            toColumn: "document_id",
            cardinality: "many_to_one",
            confidence: 0.95,
          },
        ],
      }),
    );
    const merged = mergeOntologyExtractIntoProposal(weakFk, extract, {
      reviewConfidenceThreshold: 0.85,
    });
    expect(merged.relations).toHaveLength(0);
    expect(merged.doubts[0]?.reason).toContain("below the foreign key threshold");
  });

  it("merges LLM glossary terms into the proposal without dropping existing ones", () => {
    const extract = parseOntologyExtractOutput(
      JSON.stringify({
        locale: "it",
        entities: [],
        glossary: [
          { id: "g-1", term: "CIG", definition: "Codice identificativo gara" },
          { id: "g-2", term: "Appalto", definition: "Contratto pubblico" },
        ],
      }),
    );
    const merged = mergeOntologyExtractIntoProposal(baseline, extract, {
      reviewConfidenceThreshold: 0.85,
    });
    expect(merged.glossary?.map((term) => term.id)).toEqual(["g-1", "g-2"]);
  });
});
