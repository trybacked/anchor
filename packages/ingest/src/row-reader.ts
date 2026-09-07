import type { EntityRowRequest, RowReader } from "@backed/core";
import { buildDuckDbFilterClause } from "./duckdb-filters.js";
import { documentIdsInClause, quoteIdentifier, quoteString, sqlOrderDirection, sqlWhereClause, } from "./sql.js";
import type { SqlQuery } from "./types.js";
export function createRowReader(query: SqlQuery): RowReader {
    return async (request: EntityRowRequest) => {
        const conditions = request.filters.map(buildDuckDbFilterClause);
        if (request.textSearch !== undefined && request.textSearchColumns !== undefined) {
            const text = quoteString(request.textSearch);
            const textClause = request.textSearchColumns
                .map((column) => `contains(lower(${quoteIdentifier(column)}), lower(${text}))`)
                .join(" OR ");
            conditions.push(`(${textClause})`);
        }
        const whereClause = sqlWhereClause(conditions);
        const orderClause = request.orderBy
            ? ` ORDER BY ${quoteIdentifier(request.orderBy)} ${sqlOrderDirection(request.orderDirection)}`
            : "";
        const projection = request.columns !== undefined && request.columns.length > 0
            ? request.columns.map(quoteIdentifier).join(", ")
            : "*";
        const sql = `SELECT ${projection} FROM ${quoteIdentifier(request.table)}${whereClause}${orderClause} LIMIT ${String(request.limit)}`;
        return query(sql);
    };
}
