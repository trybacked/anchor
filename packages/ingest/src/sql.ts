import { quotedIdentifier, quotedString } from "@duckdb/node-api";
import type { SqlQuery } from "./types.js";
export function quoteIdentifier(name: string): string {
    return quotedIdentifier(name);
}
export function quoteString(value: string): string {
    return quotedString(value);
}
export async function dropTableIfExists(query: SqlQuery, tableName: string): Promise<void> {
    await query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
}
export function sqlNullableString(value: string | null | undefined): string {
    if (value === null || value === undefined || value.trim() === "") {
        return "NULL";
    }
    return quoteString(value);
}
export function sqlNullableNumber(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "NULL";
    }
    return String(value);
}
export function sqlColumnSuffix(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
export function sqlWhereClause(conditions: string[]): string {
    return conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
}
export function sqlOrderDirection(direction: "asc" | "desc" | undefined): "ASC" | "DESC" {
    return direction === "desc" ? "DESC" : "ASC";
}
export function documentIdsInClause(documentIds: string[]): string {
    const literals = documentIds.map((id) => quoteString(id)).join(", ");
    return `${quoteIdentifier("document_id")} IN (${literals})`;
}
