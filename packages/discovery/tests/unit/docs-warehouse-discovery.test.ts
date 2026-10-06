import { describe, expect, it } from "vitest";
import {
  discoverDocsFromProfile,
  filterProfileForDocsDiscovery,
  warehouseTableShortName,
} from "../../src/index.js";

describe("warehouseTableShortName", () => {
  it("resolves Unity Catalog identifiers to table names", () => {
    expect(warehouseTableShortName("backed_gerace.docs.documents")).toBe("documents");
  });
});

describe("filterProfileForDocsDiscovery", () => {
  it("matches fully qualified profile tables against short allowlist", () => {
    const profile = [
      {
        table: "backed_gerace.docs.documents",
        sourceFile: "backed_gerace.docs.documents",
        rowCount: 1,
        columns: [],
      },
    ];
    const filtered = filterProfileForDocsDiscovery(profile, ["documents"]);
    expect(filtered.missingTables).toEqual([]);
    expect(filtered.profile).toHaveLength(1);
  });
});

describe("discoverDocsFromProfile", () => {
  it("proposes docs entities including materialized infra tables", () => {
    const profile = [
      {
        table: "documents",
        sourceFile: "cat.docs.documents",
        rowCount: 2,
        columns: [
          {
            name: "document_id",
            sqlType: "STRING",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 2,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
        ],
      },
      {
        table: "document_entities",
        sourceFile: "cat.docs.document_entities",
        rowCount: 5,
        columns: [
          {
            name: "entity_id",
            sqlType: "STRING",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 5,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
        ],
      },
    ];
    const result = discoverDocsFromProfile(profile, {
      ontologyId: "tenant",
      catalog: "cat",
      runId: "run-test",
      reviewConfidenceThreshold: 1,
    });
    expect(result.proposal.entities.map((entity) => entity.id).sort()).toEqual([
      "document_entities",
      "documents",
    ]);
    expect(result.proposal.entities[0]?.sourceTable).toContain("cat.docs");
  });
});
