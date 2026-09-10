import type { DiffChange, ProfileReport, TableProfile } from "@backed/core";
import { collectAddedRemoved, indexByKey } from "./utils.js";

export const COLUMN_SUBJECT_SEPARATOR = ".";

export function columnSubject(table: string, column: string): string {
    return `${table}${COLUMN_SUBJECT_SEPARATOR}${column}`;
}

function columnSubjectTable(subject: string): string {
    const separatorIndex = subject.indexOf(COLUMN_SUBJECT_SEPARATOR);
    return separatorIndex === -1 ? subject : subject.slice(0, separatorIndex);
}

export function tableFromProfileChange(change: DiffChange): string | undefined {
    switch (change.kind) {
        case "table_added":
        case "table_removed": {
            return change.subject;
        }
        case "column_added":
        case "column_removed":
        case "column_type_changed": {
            return columnSubjectTable(change.subject);
        }
        default: {
            return undefined;
        }
    }
}

function diffColumns(previous: TableProfile, next: TableProfile): DiffChange[] {
    const previousColumns = indexByKey(previous.columns, (column) => column.name);
    const nextColumns = indexByKey(next.columns, (column) => column.name);
    const table = next.table;
    const changes = collectAddedRemoved(
        previousColumns,
        nextColumns,
        (name) => ({
            kind: "column_added",
            subject: columnSubject(table, name),
            detail: `New column "${name}" in table "${table}"`,
        }),
        (name) => ({
            kind: "column_removed",
            subject: columnSubject(table, name),
            detail: `Column "${name}" removed from table "${table}"`,
        }),
    );
    for (const [name, nextColumn] of nextColumns) {
        const previousColumn = previousColumns.get(name);
        if (previousColumn && previousColumn.sqlType !== nextColumn.sqlType) {
            changes.push({
                kind: "column_type_changed",
                subject: columnSubject(table, name),
                detail: `Type of "${columnSubject(table, name)}" changed from ${previousColumn.sqlType} to ${nextColumn.sqlType}`,
                before: previousColumn.sqlType,
                after: nextColumn.sqlType,
            });
        }
    }
    return changes;
}

export function diffProfile(previous: ProfileReport, next: ProfileReport): DiffChange[] {
    const previousTables = indexByKey(previous, (table) => table.table);
    const nextTables = indexByKey(next, (table) => table.table);
    const changes = collectAddedRemoved(
        previousTables,
        nextTables,
        (name) => ({ kind: "table_added", subject: name, detail: `New table "${name}"` }),
        (name) => ({ kind: "table_removed", subject: name, detail: `Table "${name}" removed` }),
    );
    for (const [name, nextTable] of nextTables) {
        const previousTable = previousTables.get(name);
        if (previousTable) {
            changes.push(...diffColumns(previousTable, nextTable));
        }
    }
    return changes;
}

export function columnExists(profile: ProfileReport, tableName: string, columnName: string): boolean {
    const table = profile.find((candidate) => candidate.table === tableName);
    return table !== undefined && table.columns.some((column) => column.name === columnName);
}
