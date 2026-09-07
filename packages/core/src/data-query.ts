import type { AggregateOpKind } from "./object-query.js";
export const ROW_FILTER_OPS = ["=", "!=", ">", ">=", "<", "<=", "contains"] as const;
export type RowFilterOp = (typeof ROW_FILTER_OPS)[number];
export interface RowFilter {
    column: string;
    op: RowFilterOp;
    value: string | number;
}
export interface EntityRowRequest {
    table: string;
    filters: RowFilter[];
    columns?: string[];
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    limit: number;
    textSearch?: string;
    textSearchColumns?: string[];
}
export type RowReader = (request: EntityRowRequest) => Promise<Record<string, unknown>[]>;
export interface EntityAggregateRequest {
    table: string;
    column: string;
    op: AggregateOpKind;
    filters: RowFilter[];
    documentIds?: string[];
}
export type AggregateReader = (request: EntityAggregateRequest) => Promise<number | null>;
export const DEFAULT_ROW_LIMIT = 25;
export const MAX_ROW_LIMIT = 200;
