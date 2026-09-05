import { describe, expect, it, vi } from "vitest";

import type { SemanticModel } from "@backed/core";

import { traverseRelationRows } from "../../src/traverse.js";

const model: SemanticModel = {
  metadata: {
    formatVersion: "1",
    runId: "test-run",
    generatedAt: "2026-09-05T10:00:00.000Z",
  },
  entities: [
    {
      id: "determination",
      name: "Determination",
      sourceTable: "doc_determination",
      status: "confirmed",
      confidence: 0.95,
      provenance: { table: "doc_determination", evidence: "Fixture entity" },
      properties: [
        {
          name: "Document ID",
          columnName: "document_id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 0.95,
          provenance: { table: "doc_determination", column: "document_id", evidence: "Fixture" },
        },
      ],
    },
    {
      id: "document_chunk",
      name: "Document Chunk",
      sourceTable: "document_chunks",
      status: "confirmed",
      confidence: 0.95,
      provenance: { table: "document_chunks", evidence: "Fixture entity" },
      properties: [
        {
          name: "Document ID",
          columnName: "document_id",
          semanticType: "identifier",
          role: "foreign_key",
          nullable: false,
          confidence: 0.95,
          provenance: { table: "document_chunks", column: "document_id", evidence: "Fixture" },
        },
        {
          name: "Chunk text",
          columnName: "text",
          semanticType: "text",
          role: "attribute",
          nullable: false,
          confidence: 0.95,
          provenance: { table: "document_chunks", column: "text", evidence: "Fixture" },
        },
      ],
    },
  ],
  relations: [
    {
      id: "determination-has-text",
      name: "Determination has text",
      fromEntity: "determination",
      toEntity: "document_chunk",
      fromColumn: "document_id",
      toColumn: "document_id",
      cardinality: "one_to_many",
      status: "confirmed",
      confidence: 0.95,
      provenance: {
        table: "doc_determination",
        column: "document_id",
        evidence: "Shared document_id",
      },
    },
  ],
  rules: [],
  actions: [],
};

describe("traverseRelationRows", () => {
  it("follows a relation forward to linked rows", async () => {
    const reader = vi.fn(async () => [{ document_id: "doc-1", text: "Chunk body" }]);

    const result = await traverseRelationRows(model, reader, {
      relationId: "determination-has-text",
      value: "doc-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toEqual([{ document_id: "doc-1", text: "Chunk body" }]);
    }
    expect(reader).toHaveBeenCalledWith({
      table: "document_chunks",
      filters: [{ column: "document_id", op: "=", value: "doc-1" }],
      limit: 25,
    });
  });

  it("follows a relation in reverse", async () => {
    const reader = vi.fn(async () => [{ document_id: "doc-1" }]);

    const result = await traverseRelationRows(model, reader, {
      relationId: "determination-has-text",
      value: "doc-1",
      direction: "reverse",
    });

    expect(result.ok).toBe(true);
    expect(reader).toHaveBeenCalledWith({
      table: "doc_determination",
      filters: [{ column: "document_id", op: "=", value: "doc-1" }],
      limit: 25,
    });
  });

  it("returns unknown_relation for missing relation ids", async () => {
    const reader = vi.fn(async () => []);

    const result = await traverseRelationRows(model, reader, {
      relationId: "missing-relation",
      value: "doc-1",
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "unknown_relation", relationId: "missing-relation" },
    });
  });
});
