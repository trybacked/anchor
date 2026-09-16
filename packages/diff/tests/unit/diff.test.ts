import { describe, expect, it } from "vitest";
import { affectedTablesFromProfileDiff, filterProfileToTables } from "../../src/affected-tables.js";
import { diffRuns, type ModelElements, type RunSnapshot } from "../../src/diff-runs.js";
import { formatDiff } from "../../src/format.js";
import type { ProfileReport } from "@backed/core";

const baseProfile: ProfileReport = [
    {
        table: "orders",
        columns: [
            { name: "id", sqlType: "INTEGER", nullable: false },
            { name: "customer_id", sqlType: "INTEGER", nullable: false },
        ],
    },
    {
        table: "customers",
        columns: [{ name: "id", sqlType: "INTEGER", nullable: false }],
    },
];

const baseModel: ModelElements = {
    entities: [
        {
            id: "entity_orders",
            name: "Orders",
            sourceTable: "orders",
            status: "confirmed",
            confidence: 1,
            provenance: { table: "orders", evidence: "Fixture" },
            properties: [],
        },
        {
            id: "entity_customers",
            name: "Customers",
            sourceTable: "customers",
            status: "confirmed",
            confidence: 1,
            provenance: { table: "customers", evidence: "Fixture" },
            properties: [],
        },
    ],
    relations: [
        {
            id: "orders-to-customers",
            name: "Orders to Customers",
            fromEntity: "entity_orders",
            toEntity: "entity_customers",
            fromColumn: "customer_id",
            toColumn: "id",
            status: "confirmed",
            confidence: 1,
            provenance: { table: "orders", evidence: "Fixture" },
        },
    ],
    rules: [],
};

function snapshot(runId: string, profile: ProfileReport, model?: ModelElements): RunSnapshot {
    return { runId, profile, model };
}

describe("diffProfile via diffRuns", () => {
    it("detects table and column changes", () => {
        const nextProfile: ProfileReport = [
            {
                table: "orders",
                columns: [
                    { name: "id", sqlType: "TEXT", nullable: false },
                    { name: "customer_id", sqlType: "INTEGER", nullable: false },
                    { name: "total", sqlType: "DECIMAL", nullable: true },
                ],
            },
            {
                table: "products",
                columns: [{ name: "id", sqlType: "INTEGER", nullable: false }],
            },
        ];

        const diff = diffRuns(
            snapshot("run-a", baseProfile),
            snapshot("run-b", nextProfile),
            new Date("2026-09-07T20:00:00.000Z"),
        );

        expect(diff.changes.map((change) => change.kind)).toEqual([
            "table_added",
            "table_removed",
            "column_added",
            "column_type_changed",
        ]);
    });
});

describe("diffRuns model changes", () => {
    it("classifies broken relations when anchor columns disappear", () => {
        const nextProfile: ProfileReport = [
            {
                table: "orders",
                columns: [{ name: "id", sqlType: "INTEGER", nullable: false }],
            },
            baseProfile[1]!,
        ];

        const diff = diffRuns(
            snapshot("run-a", baseProfile, baseModel),
            snapshot("run-b", nextProfile, { entities: baseModel.entities, relations: [], rules: [] }),
        );

        expect(diff.changes.some((change) => change.kind === "relation_broken")).toBe(true);
    });
});

describe("affectedTablesFromProfileDiff", () => {
    it("returns tables touched by profile diffs", () => {
        const nextProfile: ProfileReport = [
            {
                table: "orders",
                columns: [
                    { name: "id", sqlType: "TEXT", nullable: false },
                    { name: "total", sqlType: "DECIMAL", nullable: true },
                ],
            },
            baseProfile[1]!,
        ];

        expect(affectedTablesFromProfileDiff(baseProfile, nextProfile)).toEqual(new Set(["orders"]));
    });

    it("ignores pipeline infra tables and table removals", () => {
        const previousProfile: ProfileReport = [
            {
                table: "doc_publication",
                sourceFile: "document-catalog:publication",
                rowCount: 2,
                columns: [{ name: "document_id", sqlType: "TEXT", nullable: false }],
            },
            {
                table: "document_lines",
                sourceFile: "document-catalog:lines",
                rowCount: 10,
                columns: [{ name: "text", sqlType: "TEXT", nullable: false }],
            },
        ];
        const nextProfile: ProfileReport = [
            {
                table: "doc_notice",
                sourceFile: "document-catalog:notice",
                rowCount: 1,
                columns: [{ name: "document_id", sqlType: "TEXT", nullable: false }],
            },
            {
                table: "document_chunks",
                sourceFile: "document-catalog:chunks",
                rowCount: 3,
                columns: [{ name: "text", sqlType: "TEXT", nullable: false }],
            },
        ];

        expect(affectedTablesFromProfileDiff(previousProfile, nextProfile)).toEqual(new Set(["doc_notice"]));
    });

    it("marks tables whose row counts changed", () => {
        const previousProfile: ProfileReport = [{
            table: "doc_publication",
            sourceFile: "document-catalog:publication",
            rowCount: 99,
            columns: [{ name: "document_id", sqlType: "TEXT", nullable: false }],
        }];
        const nextProfile: ProfileReport = [{
            table: "doc_publication",
            sourceFile: "document-catalog:publication",
            rowCount: 100,
            columns: [{ name: "document_id", sqlType: "TEXT", nullable: false }],
        }];
        expect(affectedTablesFromProfileDiff(previousProfile, nextProfile)).toEqual(new Set(["doc_publication"]));
    });
});

describe("filterProfileToTables", () => {
    it("keeps only selected tables", () => {
        expect(filterProfileToTables(baseProfile, new Set(["orders"]))).toEqual([baseProfile[0]]);
    });
});

describe("formatDiff", () => {
    it("summarizes breaking relation changes", () => {
        const nextProfile: ProfileReport = [
            {
                table: "orders",
                columns: [{ name: "id", sqlType: "INTEGER", nullable: false }],
            },
            baseProfile[1]!,
        ];

        const diff = diffRuns(
            snapshot("run-a", baseProfile, baseModel),
            snapshot("run-b", nextProfile, {
                entities: baseModel.entities,
                relations: [],
                rules: [],
            }),
        );

        expect(formatDiff(diff)).toContain("broken relation");
    });
});
