import type { AggregateOp, ObjectQueryReader, TableObjectQueryRequest, } from "@backed/core";
import { resolveAggregationAlias } from "@backed/core";
import { buildDuckDbFilterClause } from "./duckdb-filters.js";
import { documentIdsInClause, quoteIdentifier, sqlOrderDirection, sqlWhereClause } from "./sql.js";
import type { SqlQuery } from "./types.js";
function aggregateExpression(aggregation: AggregateOp): string {
    const column = aggregation.column !== undefined && aggregation.column.length > 0
        ? quoteIdentifier(aggregation.column)
        : null;
    switch (aggregation.op) {
        case "sum":
            return `SUM(${column ?? "NULL"})`;
        case "count":
            return column !== null ? `COUNT(${column})` : "COUNT(*)";
        case "min":
            return `MIN(${column ?? "NULL"})`;
        case "max":
            return `MAX(${column ?? "NULL"})`;
        case "avg":
            return `AVG(${column ?? "NULL"})`;
        default: {
            const _exhaustive: never = aggregation.op;
            return _exhaustive;
        }
    }
}
function buildSelectClause(request: TableObjectQueryRequest): string {
    const parts: string[] = [];
    for (const column of request.groupBy ?? []) {
        parts.push(quoteIdentifier(column));
    }
    for (const [index, aggregation] of request.aggregations.entries()) {
        const alias = resolveAggregationAlias(aggregation, index);
        parts.push(`${aggregateExpression(aggregation)} AS ${quoteIdentifier(alias)}`);
    }
    return parts.join(", ");
}
function normalizeRowValue(value: unknown): unknown {
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return value;
}
function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
            normalized[key] = normalizeRowValue(value);
        }
        return normalized;
    });
}
export function createObjectQueryReader(query: SqlQuery): ObjectQueryReader {
    return async (request: TableObjectQueryRequest) => {
        const conditions = request.filters.map(buildDuckDbFilterClause);
        if (request.documentIds !== undefined && request.documentIds.length > 0) {
            conditions.push(documentIdsInClause(request.documentIds));
        }
        const whereClause = sqlWhereClause(conditions);
        const groupByClause = request.groupBy !== undefined && request.groupBy.length > 0
            ? ` GROUP BY ${request.groupBy.map(quoteIdentifier).join(", ")}`
            : "";
        const orderClause = request.orderBy
            ? ` ORDER BY ${quoteIdentifier(request.orderBy)} ${sqlOrderDirection(request.orderDirection)}`
            : "";
        const sql = `SELECT ${buildSelectClause(request)} FROM ${quoteIdentifier(request.table)}${whereClause}${groupByClause}${orderClause} LIMIT ${String(request.limit)}`;
        const rows = await query(sql);
        return normalizeRows(rows);
    };
}
