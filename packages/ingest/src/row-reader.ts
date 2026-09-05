import type { EntityRowRequest, RowFilter, RowReader } from "@backed/core";

import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";

function formatFilterValue(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  return quoteString(value);
}

function buildFilterClause(filter: RowFilter): string {
  const column = quoteIdentifier(filter.column);
  const value = formatFilterValue(filter.value);
  switch (filter.op) {
    case "=":
      return `${column} = ${value}`;
    case "!=":
      return `${column} <> ${value}`;
    case ">":
      return `${column} > ${value}`;
    case ">=":
      return `${column} >= ${value}`;
    case "<":
      return `${column} < ${value}`;
    case "<=":
      return `${column} <= ${value}`;
    default: {
      const _exhaustive: never = filter.op;
      return _exhaustive;
    }
  }
}

export function createRowReader(query: SqlQuery): RowReader {
  return async (request: EntityRowRequest) => {
    const whereClause =
      request.filters.length > 0
        ? ` WHERE ${request.filters.map(buildFilterClause).join(" AND ")}`
        : "";
    const orderClause = request.orderBy
      ? ` ORDER BY ${quoteIdentifier(request.orderBy)}`
      : "";
    const sql = `SELECT * FROM ${quoteIdentifier(request.table)}${whereClause}${orderClause} LIMIT ${String(request.limit)}`;
    return query(sql);
  };
}
