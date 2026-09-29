import type { Ontology } from "@trybacked/core";
import type { OntologyQueryRuntime } from "@trybacked/runtime";
import { describe, expect, it } from "vitest";
import {
  createSemanticChatEngine,
  normalizeSemanticQueryPlan,
  buildRowProvenance,
} from "../../src/index.js";

const ontology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "backed.anac.contracts",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        { id: "oggetto_gara", name: "Subject", type: "string", role: "attribute" },
        { id: "document_id", name: "Document", type: "string", role: "attribute" },
        { id: "page_start", name: "Page start", type: "integer", role: "attribute" },
      ],
    },
  ],
  relationships: [],
  logic: [],
  actions: [],
};

describe("semantic-chat engine", () => {
  it("executes a plan deterministically with provenance", async () => {
    const runtime: OntologyQueryRuntime = {
      queryObjects: async () => ({
        objectId: "contract",
        columns: ["cig", "document_id", "page_start"],
        rows: [{ cig: "ABC", document_id: "doc-1", page_start: 3 }],
        rowCount: 1,
        sql: "stub",
      }),
    };
    const engine = createSemanticChatEngine({
      ontology,
      queryRuntime: runtime,
      translate: async () => {
        throw new Error("should not run");
      },
    });

    const answer = await engine.executePlan({
      objectQuery: {
        entityId: "contract",
        filters: [{ column: "oggetto_gara", op: "contains", value: "pagament" }],
        limit: 5,
      },
    });

    expect(answer.result.rowCount).toBe(1);
    expect(answer.ontologyVersion).toBe(1);
    expect(answer.parameterNames.length).toBeGreaterThan(0);
    expect(answer.provenance[0]?.entity.objectId).toBe("contract");
    expect(answer.provenance[0]?.document).toMatchObject({
      documentId: "doc-1",
      pageStart: 3,
      page: 3,
    });
    expect(answer.result.sql).toContain("`backed`.`anac`.`contracts`");
  });

  it("normalizes legacy column and = operator", () => {
    const normalized = normalizeSemanticQueryPlan({
      objectQuery: {
        entityId: "contract",
        filters: [{ column: "cig", op: "=", value: "X" }],
      },
    });
    expect(normalized.objectQuery.filters?.[0]).toMatchObject({
      propertyId: "cig",
      op: "eq",
      value: "X",
    });
  });

  it("builds row provenance without document columns", () => {
    const rows = buildRowProvenance({
      ontology,
      objectId: "contract",
      rows: [{ cig: "Z" }],
    });
    expect(rows[0]?.document).toBeUndefined();
    expect(rows[0]?.entity.objectName).toBe("Contract");
  });
});
