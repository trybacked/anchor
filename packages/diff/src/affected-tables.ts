import { isPipelineInfraDatasetTable, PIPELINE_INFRA_DATASET_TABLE_NAMES } from "@trybacked/core";
import type { ProfileReport } from "@trybacked/core";
import { diffProfile, tableFromProfileChange } from "./profile-diff.js";

/** @deprecated Prefer `isPipelineInfraDatasetTable` from `@trybacked/core`. */
export const PIPELINE_INFRA_TABLES = new Set<string>(PIPELINE_INFRA_DATASET_TABLE_NAMES);

function isPipelineInfraTable(tableName: string): boolean {
  return isPipelineInfraDatasetTable(tableName);
}

export function affectedTablesFromProfileDiff(
  previous: ProfileReport,
  next: ProfileReport,
): Set<string> {
  const previousTables = new Map(previous.map((table) => [table.table, table]));
  const nextTableNames = new Set(next.map((table) => table.table));
  const affected = new Set<string>();
  for (const change of diffProfile(previous, next)) {
    if (change.kind === "table_removed") {
      continue;
    }
    const table = tableFromProfileChange(change);
    if (table === undefined || isPipelineInfraTable(table)) {
      continue;
    }
    if (change.kind === "table_added" || nextTableNames.has(table)) {
      affected.add(table);
    }
  }
  for (const nextTable of next) {
    if (isPipelineInfraTable(nextTable.table)) {
      continue;
    }
    const previousTable = previousTables.get(nextTable.table);
    if (previousTable === undefined) {
      affected.add(nextTable.table);
      continue;
    }
    if (previousTable.rowCount !== nextTable.rowCount) {
      affected.add(nextTable.table);
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
