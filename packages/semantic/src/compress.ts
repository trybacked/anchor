/**
 * Compression of profile.json into the LLM input packet.
 * GDPR by construction: only statistics, column names, detected patterns and
 * aggregated top values ever leave the machine — never raw rows.
 */

import type { ColumnProfile, ProfileReport, TableProfile } from "@backed/core";

export const COMPRESSED_TOP_VALUES_LIMIT = 5;
const TOP_VALUE_MAX_LENGTH = 40;

export interface CompressedColumn {
  name: string;
  sqlType: string;
  nullRatio: number;
  distinctCount: number;
  isCandidateKey: boolean;
  patterns: string[];
  topValues: string[];
  foreignKeyCandidates: { targetTable: string; targetColumn: string; overlapRatio: number; confidence: number }[];
}

export interface CompressedTable {
  table: string;
  rowCount: number;
  candidateKeys: string[];
  columns: CompressedColumn[];
}

function truncateValue(value: string): string {
  return value.length > TOP_VALUE_MAX_LENGTH ? `${value.slice(0, TOP_VALUE_MAX_LENGTH)}…` : value;
}

function isCandidateKey(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function compressColumn(column: ColumnProfile, rowCount: number): CompressedColumn {
  return {
    name: column.name,
    sqlType: column.sqlType,
    nullRatio: Number(column.nullRatio.toFixed(3)),
    distinctCount: column.distinctCount,
    isCandidateKey: isCandidateKey(column, rowCount),
    patterns: column.patterns.map((pattern) => pattern.kind),
    topValues: column.topValues
      .slice(0, COMPRESSED_TOP_VALUES_LIMIT)
      .map((top) => truncateValue(top.value)),
    foreignKeyCandidates: column.foreignKeyCandidates.map((candidate) => ({
      targetTable: candidate.targetTable,
      targetColumn: candidate.targetColumn,
      overlapRatio: candidate.overlapRatio,
      confidence: candidate.confidence,
    })),
  };
}

function compressTable(table: TableProfile): CompressedTable {
  const columns = table.columns.map((column) => compressColumn(column, table.rowCount));
  return {
    table: table.table,
    rowCount: table.rowCount,
    candidateKeys: columns.filter((column) => column.isCandidateKey).map((column) => column.name),
    columns,
  };
}

export function compressProfile(report: ProfileReport): CompressedTable[] {
  return report.map(compressTable);
}
