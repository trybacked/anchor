import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  diffOntology,
  hasBreakingOntologyChanges,
  listPublicationVersions,
  publishSemanticModel,
  readPublicationByVersion,
  rollbackPublication,
} from "../../src/index.js";

const baseModel = {
  metadata: {
    formatVersion: "1" as const,
    runId: "run-1",
    generatedAt: new Date().toISOString(),
  },
  entities: [
    {
      id: "orders",
      name: "Orders",
      sourceTable: "orders",
      status: "confirmed" as const,
      confidence: 0.9,
      provenance: { table: "orders", evidence: "test" },
      properties: [
        {
          name: "Id",
          columnName: "id",
          semanticType: "identifier" as const,
          role: "primary_key" as const,
          nullable: false,
          confidence: 0.9,
          provenance: { table: "orders", column: "id", evidence: "pk" },
        },
      ],
    },
  ],
  relations: [],
  rules: [],
};

describe("ontology versioning essentials", () => {
  it("archives publications and supports rollback", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "anchor-versioning-"));
    try {
      publishSemanticModel(root, baseModel, { ontologyId: "demo" });
      publishSemanticModel(root, {
        ...baseModel,
        metadata: { ...baseModel.metadata, runId: "run-2" },
        entities: [
          ...baseModel.entities,
          {
            id: "customers",
            name: "Customers",
            sourceTable: "customers",
            status: "confirmed" as const,
            confidence: 0.9,
            provenance: { table: "customers", evidence: "test" },
            properties: [
              {
                name: "Id",
                columnName: "id",
                semanticType: "identifier" as const,
                role: "primary_key" as const,
                nullable: false,
                confidence: 0.9,
                provenance: { table: "customers", column: "id", evidence: "pk" },
              },
            ],
          },
        ],
      }, { ontologyId: "demo" });

      expect(listPublicationVersions(root)).toHaveLength(2);
      expect(readPublicationByVersion(root, 1)?.ontology.objects).toHaveLength(1);

      const rolled = rollbackPublication(root, 1);
      expect(rolled.version).toBe(1);
      expect(rolled.ontology.objects).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags breaking ontology diffs", () => {
    const left = publishSemanticModel(
      mkdtempSync(path.join(os.tmpdir(), "anchor-diff-a-")),
      baseModel,
      { ontologyId: "demo" },
    ).ontology;
    const diff = diffOntology(left, { ...left, objects: [] }, { fromVersion: 1, toVersion: 2 });
    expect(hasBreakingOntologyChanges(diff)).toBe(true);
  });
});
