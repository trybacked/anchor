import { describe, expect, it } from "vitest";
import { AGGREGATE_OPS, DEFAULT_OBJECT_QUERY_LIMIT, MAX_OBJECT_QUERY_LIMIT, ROW_FILTER_OPS, resolveAggregationAlias, type AggregateOp, type ObjectQueryRequest, type ObjectSetDefinition, } from "../../src/index.js";
import type { GraphTraverseRequest } from "../../src/graph-traverse.js";
describe("object-query contracts", () => {
    it("exports aggregate operation kinds including avg", () => {
        expect(AGGREGATE_OPS).toEqual(["sum", "count", "min", "max", "avg"]);
    });
    it("shares row filter ops with data-query", () => {
        expect(ROW_FILTER_OPS).toContain("contains");
        expect(ROW_FILTER_OPS).toContain("=");
    });
    it("defines object query limits", () => {
        expect(DEFAULT_OBJECT_QUERY_LIMIT).toBeLessThan(MAX_OBJECT_QUERY_LIMIT);
    });
    it("accepts a structured object query with aggregations and groupBy", () => {
        const request: ObjectQueryRequest = {
            entityId: "determination",
            filters: [{ column: "sector", op: "=", value: "Turismo" }],
            aggregations: [
                { op: "sum", column: "amount", alias: "total_spent" },
                { op: "count" },
            ],
            groupBy: ["sector"],
            orderBy: "total_spent",
            orderDirection: "desc",
            limit: 100,
        };
        expect(request.entityId).toBe("determination");
        expect(request.aggregations).toHaveLength(2);
        expect(request.groupBy).toEqual(["sector"]);
    });
    it("accepts an object set with document scope and time range", () => {
        const objectSet: ObjectSetDefinition = {
            entityId: "determination",
            filters: [{ column: "municipality", op: "=", value: "Modena" }],
            documentIds: ["doc-1", "doc-2"],
            timeRange: { column: "published_date", from: "2026-01-01", to: "2026-03-31" },
            limit: 50,
        };
        expect(objectSet.documentIds).toHaveLength(2);
        expect(objectSet.timeRange?.column).toBe("published_date");
    });
    it("accepts graph traverse requests for relation hops", () => {
        const traverse: GraphTraverseRequest = {
            relationId: "determination-has-text",
            value: "doc-1",
            direction: "forward",
            limit: 25,
        };
        expect(traverse.relationId).toBe("determination-has-text");
        expect(traverse.direction).toBe("forward");
    });
    it("allows count aggregations without a column", () => {
        const aggregation: AggregateOp = { op: "count", alias: "row_count" };
        expect(aggregation.column).toBeUndefined();
        expect(aggregation.op).toBe("count");
    });
    it("resolves aggregation aliases with defaults", () => {
        expect(resolveAggregationAlias({ op: "sum", column: "amount" }, 0)).toBe("amount_sum");
        expect(resolveAggregationAlias({ op: "count", alias: "fact_count" }, 0)).toBe("fact_count");
        expect(resolveAggregationAlias({ op: "count" }, 0)).toBe("count");
    });
});
