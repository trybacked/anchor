import type { RowFilter } from "@backed/core";
import { quoteIdentifier, quoteString } from "./sql.js";
function formatFilterValue(value: string | number): string {
    if (typeof value === "number") {
        return String(value);
    }
    return quoteString(value);
}
export function buildDuckDbFilterClause(filter: RowFilter): string {
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
        case "contains":
            return `contains(lower(${column}), lower(${value}))`;
        default: {
            const _exhaustive: never = filter.op;
            return _exhaustive;
        }
    }
}
