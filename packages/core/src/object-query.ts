import type { RowFilter } from "./data-query.js";
export const AGGREGATE_OPS = ["sum", "count", "min", "max", "avg"] as const;
const DEFAULT_COUNT_AGGREGATION_ALIAS = "count";
export type AggregateOpKind = (typeof AGGREGATE_OPS)[number];
export interface AggregateOp {
    op: AggregateOpKind;
    column?: string;
    alias?: string;
}
export interface TimeRange {
    column: string;
    from?: string;
    to?: string;
}
export interface ObjectQueryRequest {
    entityId: string;
    filters: RowFilter[];
    aggregations?: AggregateOp[];
    groupBy?: string[];
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    limit?: number;
    documentIds?: string[];
}
export interface ObjectSetDefinition {
    entityId: string;
    filters: RowFilter[];
    documentIds?: string[];
    timeRange?: TimeRange;
    limit?: number;
}
export type ObjectQueryExecutor = (request: ObjectQueryRequest) => Promise<Record<string, unknown>[]>;
export interface TableObjectQueryRequest {
    table: string;
    filters: RowFilter[];
    aggregations: AggregateOp[];
    groupBy?: string[];
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    limit: number;
    documentIds?: string[];
}
export type ObjectQueryReader = (request: TableObjectQueryRequest) => Promise<Record<string, unknown>[]>;
export function resolveAggregationAlias(aggregation: AggregateOp, index: number): string {
    if (aggregation.alias !== undefined && aggregation.alias.length > 0) {
        return aggregation.alias;
    }
    if (aggregation.column !== undefined && aggregation.column.length > 0) {
        return `${aggregation.column}_${aggregation.op}`;
    }
    return index === 0 ? DEFAULT_COUNT_AGGREGATION_ALIAS : `${DEFAULT_COUNT_AGGREGATION_ALIAS}_${String(index)}`;
}
export const DEFAULT_OBJECT_QUERY_LIMIT = 25;
export const MAX_OBJECT_QUERY_LIMIT = 500;
