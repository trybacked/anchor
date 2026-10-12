import { describe, expect, it } from "vitest";
import { applyFoundryForeignKeyHints } from "../../src/adapters/duckdb/foundry-profile-foreign-keys.js";

describe("applyFoundryForeignKeyHints", () => {
  it("links mention tables to documents and profile tables", () => {
    const profile = applyFoundryForeignKeyHints([
      {
        table: "documents",
        sourceFile: "cat.docs.documents",
        rowCount: 1,
        columns: [
          {
            name: "document_id",
            sqlType: "VARCHAR",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 1,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
        ],
      },
      {
        table: "document_organization_mentions",
        sourceFile: "cat.docs.document_organization_mentions",
        rowCount: 3,
        columns: [
          {
            name: "document_id",
            sqlType: "VARCHAR",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 1,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
          {
            name: "organization_normalized_name",
            sqlType: "VARCHAR",
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
        table: "organization_profiles",
        sourceFile: "cat.docs.organization_profiles",
        rowCount: 2,
        columns: [
          {
            name: "normalized_name",
            sqlType: "VARCHAR",
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
    ]);
    const mentions = profile.find((table) => table.table === "document_organization_mentions");
    const docFk = mentions?.columns.find((column) => column.name === "document_id");
    const orgFk = mentions?.columns.find(
      (column) => column.name === "organization_normalized_name",
    );
    expect(docFk?.foreignKeyCandidates[0]?.targetTable).toBe("documents");
    expect(orgFk?.foreignKeyCandidates[0]?.targetTable).toBe("organization_profiles");
  });
});
