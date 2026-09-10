import type { AggregateReader, EntityAggregateRequest } from "@backed/core";
import { buildDuckDbFilterClause } from "./duckdb-filters.js";
import { documentIdsInClause, quoteIdentifier, sqlWhereClause } from "./sql.js";
import type { SqlQuery } from "./types.js";
function aggregateExpression(request: EntityAggregateRequest): string {
    const column = quoteIdentifier(request.column);
    switch (request.op) {
        case "sum":
            return `SUM(${column})`;
        case "count":
            return "COUNT(*)";
        case "min":
            return `MIN(${column})`;
        case "max":
            return `MAX(${column})`;
        case "avg":
            return `AVG(${column})`;
        default: {
            const _exhaustive: never = request.op;
            return _exhaustive;
        }
    }
}
function readAggregateValue(rows: Record<string, unknown>[]): number | null {
    const raw = rows[0]?.["value"];
    if (raw === null || raw === undefined) {
        return null;
    }
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === "bigint") {
        return Number(raw);
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}
export function createAggregateReader(query: SqlQuery): AggregateReader {
    return async (request: EntityAggregateRequest) => {
        const conditions = request.filters.map(buildDuckDbFilterClause);
        if (request.documentIds !== undefined && request.documentIds.length > 0) {
            conditions.push(documentIdsInClause(request.documentIds));
        }
        const whereClause = sqlWhereClause(conditions);
        const expression = aggregateExpression(request);
        const sql = `SELECT ${expression} AS value FROM ${quoteIdentifier(request.table)}${whereClause}`;
        const rows = await query(sql);
        return readAggregateValue(rows);
    };
}
