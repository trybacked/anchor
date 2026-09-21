import { describe, expect, it } from "vitest";
import { discoverFromProfile, inspectProfileReport } from "../../src/index.js";

describe("discoverFromProfile", () => {
  it("proposes objects, properties, and relationships from profile statistics", () => {
    const profile = [
      {
        table: "orders",
        sourceFile: "orders.csv",
        rowCount: 100,
        columns: [
          {
            name: "id",
            sqlType: "BIGINT",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 100,
            min: "1",
            max: "100",
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
          {
            name: "customer_id",
            sqlType: "BIGINT",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 40,
            min: "1",
            max: "40",
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [
              {
                targetTable: "customers",
                targetColumn: "id",
                overlapRatio: 0.98,
                confidence: 0.96,
              },
            ],
          },
        ],
      },
      {
        table: "customers",
        sourceFile: "customers.csv",
        rowCount: 40,
        columns: [
          {
            name: "id",
            sqlType: "BIGINT",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 40,
            min: "1",
            max: "40",
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
        ],
      },
    ];

    const inspection = inspectProfileReport(profile);
    expect(inspection.tables).toHaveLength(2);
    expect(inspection.tables[0]?.primaryKeyCandidates).toEqual(["id"]);

    const report = discoverFromProfile(profile, { ontologyId: "demo" });
    expect(report.ontology.objects).toHaveLength(2);
    expect(report.ontology.relationships).toHaveLength(1);
    expect(report.ontology.relationships[0]?.status).toBe("proposed");
    expect(report.ontology.relationships[0]?.cardinality).toBe("many_to_one");
    expect(report.ontology.objects[0]?.properties[0]?.role).toBe("primary_key");
  });

  it("skips pipeline infrastructure tables", () => {
    const profile = [
      {
        table: "document_lines",
        sourceFile: "internal",
        rowCount: 10,
        columns: [
          {
            name: "line",
            sqlType: "VARCHAR",
            nullCount: 0,
            nullRatio: 0,
            distinctCount: 10,
            min: null,
            max: null,
            topValues: [],
            patterns: [],
            foreignKeyCandidates: [],
          },
        ],
      },
    ];
    const report = discoverFromProfile(profile, { ontologyId: "demo" });
    expect(report.ontology.objects).toHaveLength(0);
  });
});
