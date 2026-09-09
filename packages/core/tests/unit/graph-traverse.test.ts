import { describe, expect, it } from "vitest";
import { buildRelationPath, clampTraverseDepth, resolveRelationPath, type SemanticModel, } from "../../src/graph-traverse.js";
const model: SemanticModel = {
    metadata: {
        formatVersion: "1",
        runId: "test-run",
        generatedAt: "2026-09-05T10:00:00.000Z",
    },
    entities: [
        {
            id: "entity_a",
            name: "Entity A",
            sourceTable: "table_a",
            status: "confirmed",
            confidence: 0.95,
            provenance: { table: "table_a", evidence: "Fixture" },
            properties: [],
        },
        {
            id: "entity_b",
            name: "Entity B",
            sourceTable: "table_b",
            status: "confirmed",
            confidence: 0.95,
            provenance: { table: "table_b", evidence: "Fixture" },
            properties: [],
        },
        {
            id: "entity_c",
            name: "Entity C",
            sourceTable: "table_c",
            status: "confirmed",
            confidence: 0.95,
            provenance: { table: "table_c", evidence: "Fixture" },
            properties: [],
        },
    ],
    relations: [
        {
            id: "a-to-b",
            name: "A to B",
            fromEntity: "entity_a",
            toEntity: "entity_b",
            fromColumn: "a_id",
            toColumn: "a_id",
            cardinality: "one_to_many",
            status: "confirmed",
            confidence: 0.95,
            provenance: { table: "table_a", column: "a_id", evidence: "Fixture" },
        },
        {
            id: "b-to-c",
            name: "B to C",
            fromEntity: "entity_b",
            toEntity: "entity_c",
            fromColumn: "b_id",
            toColumn: "b_id",
            cardinality: "one_to_many",
            status: "confirmed",
            confidence: 0.95,
            provenance: { table: "table_b", column: "b_id", evidence: "Fixture" },
        },
    ],
    rules: [],
};
describe("clampTraverseDepth", () => {
    it("defaults to one hop", () => {
        expect(clampTraverseDepth(undefined)).toBe(1);
    });
    it("clamps depth to the supported range", () => {
        expect(clampTraverseDepth(0)).toBe(1);
        expect(clampTraverseDepth(5)).toBe(3);
    });
});
describe("buildRelationPath", () => {
    it("extends forward chains while entities connect", () => {
        const path = buildRelationPath(model, "a-to-b", "forward", 3);
        expect(path).toEqual([
            { relationId: "a-to-b", direction: "forward" },
            { relationId: "b-to-c", direction: "forward" },
        ]);
    });
    it("returns null for unknown relations", () => {
        expect(buildRelationPath(model, "missing", "forward", 2)).toBeNull();
    });
});
describe("resolveRelationPath", () => {
    it("includes column metadata for each hop", () => {
        const hops = buildRelationPath(model, "a-to-b", "forward", 2);
        expect(hops).not.toBeNull();
        const segments = resolveRelationPath(model, hops!);
        expect(segments).toEqual([
            {
                relationId: "a-to-b",
                direction: "forward",
                fromEntity: "entity_a",
                toEntity: "entity_b",
                fromColumn: "a_id",
                toColumn: "a_id",
            },
            {
                relationId: "b-to-c",
                direction: "forward",
                fromEntity: "entity_b",
                toEntity: "entity_c",
                fromColumn: "b_id",
                toColumn: "b_id",
            },
        ]);
    });
});
