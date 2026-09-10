import { quoteIdentifier, quoteString, sqlNullableString } from "./sql.js";
import type { SqlQuery } from "./types.js";

export interface DocumentFieldUpdate {
    documentId: string;
    tableName: string;
    fields: Record<string, string | null | undefined>;
}

async function ensureDocumentFieldColumns(query: SqlQuery, tableName: string, fieldKeys: string[]): Promise<void> {
    if (fieldKeys.length === 0) {
        return;
    }
    const rows = await query(`SELECT column_name FROM information_schema.columns
     WHERE table_name = ${quoteString(tableName)}`);
    const existing = new Set(rows.map((row) => String(row["column_name"])));
    for (const key of fieldKeys) {
        if (!existing.has(key)) {
            await query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(key)} VARCHAR`);
        }
    }
}

export async function applyDocumentFields(query: SqlQuery, updates: DocumentFieldUpdate[]): Promise<number> {
    let updated = 0;
    for (const update of updates) {
        const fieldEntries = Object.entries(update.fields).filter(([, value]) => value !== undefined);
        if (fieldEntries.length === 0) {
            continue;
        }
        await ensureDocumentFieldColumns(query, update.tableName, fieldEntries.map(([key]) => key));
        const assignments = fieldEntries.map(([key, value]) => `${quoteIdentifier(key)} = ${sqlNullableString(value ?? null)}`);
        await query(`UPDATE ${quoteIdentifier(update.tableName)}
       SET ${assignments.join(", ")}
       WHERE document_id = ${quoteString(update.documentId)}`);
        updated += 1;
    }
    return updated;
}
