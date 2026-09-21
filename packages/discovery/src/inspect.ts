import type {
  ColumnProfile,
  DatasetInspection,
  ProfileReport,
  TableProfile,
} from "@trybacked/core";
import { PIPELINE_INFRA_DATASET_TABLE_NAMES } from "@trybacked/core";

const INFRA_TABLES = new Set<string>(PIPELINE_INFRA_DATASET_TABLE_NAMES);

function isPrimaryKeyCandidate(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function inspectTable(table: TableProfile): DatasetInspection["tables"][number] {
  const primaryKeyCandidates = table.columns
    .filter((column) => isPrimaryKeyCandidate(column, table.rowCount))
    .map((column) => column.name);
  const foreignKeyColumnCount = table.columns.filter(
    (column) => column.foreignKeyCandidates.length > 0,
  ).length;
  return {
    datasetId: table.table,
    rowCount: table.rowCount,
    columnCount: table.columns.length,
    primaryKeyCandidates,
    foreignKeyColumnCount,
  };
}

export function inspectProfileReport(profile: ProfileReport): DatasetInspection {
  const eligible = profile.filter((table) => !INFRA_TABLES.has(table.table));
  return {
    inspectedAt: new Date().toISOString(),
    tables: eligible.map(inspectTable),
  };
}
