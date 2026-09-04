import type { ProfileReport } from "@backed/core";

function tableNameFromSubject(subject: string): string {
  return subject.split(".")[0] ?? subject;
}

/** Tables whose profile changed between two runs — inputs for incremental re-inference. */
export function affectedTablesFromProfileDiff(
  previous: ProfileReport,
  next: ProfileReport,
): Set<string> {
  const affected = new Set<string>();
  const previousTables = new Map(previous.map((table) => [table.table, table]));
  const nextTables = new Map(next.map((table) => [table.table, table]));

  for (const [name] of nextTables) {
    if (!previousTables.has(name)) {
      affected.add(name);
    }
  }
  for (const [name] of previousTables) {
    if (!nextTables.has(name)) {
      affected.add(name);
    }
  }

  for (const [name, nextTable] of nextTables) {
    const previousTable = previousTables.get(name);
    if (!previousTable) {
      continue;
    }
    const previousColumns = new Map(previousTable.columns.map((column) => [column.name, column]));
    const nextColumns = new Map(nextTable.columns.map((column) => [column.name, column]));

    for (const [columnName] of nextColumns) {
      if (!previousColumns.has(columnName)) {
        affected.add(name);
      }
    }
    for (const [columnName] of previousColumns) {
      if (!nextColumns.has(columnName)) {
        affected.add(name);
      }
    }
    for (const [columnName, nextColumn] of nextColumns) {
      const previousColumn = previousColumns.get(columnName);
      if (previousColumn && previousColumn.sqlType !== nextColumn.sqlType) {
        affected.add(name);
      }
    }
  }

  return affected;
}

export function filterProfileToTables(
  profile: ProfileReport,
  tableNames: Set<string>,
): ProfileReport {
  return profile.filter((table) => tableNames.has(table.table));
}

export { tableNameFromSubject };
