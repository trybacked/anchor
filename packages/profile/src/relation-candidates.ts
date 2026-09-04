import {
  PROFILE_FK_CANDIDATES_PER_COLUMN,
  PROFILE_FK_OVERLAP_THRESHOLD,
  PROFILE_FK_SAMPLE_SIZE,
} from "@backed/core";
import type { ColumnProfile, ForeignKeyCandidate, ProfileReport, TableProfile } from "@backed/core";
import { quoteIdentifier } from "@backed/ingest";
import type { SqlQuery } from "@backed/ingest";

const FK_COLUMN_NAME_PATTERN = /(^id$|_id$|_code$|^codice|^ref_)/i;

function isCandidateKey(column: ColumnProfile, rowCount: number): boolean {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function looksLikeForeignKeyColumn(column: ColumnProfile, rowCount: number): boolean {
  if (FK_COLUMN_NAME_PATTERN.test(column.name)) {
    return true;
  }
  return rowCount > 0 && column.distinctCount > 1 && column.distinctCount < rowCount * 0.5;
}

export function nameAlignmentBonus(fromColumn: string, toTable: string, toColumn: string): number {
  const fromStem = fromColumn.toLowerCase().replace(/_id$|_code$/, "");
  const tableNorm = toTable.toLowerCase().replace(/_/g, "");
  if (
    fromStem.includes(tableNorm) ||
    tableNorm.startsWith(fromStem) ||
    fromStem.startsWith(tableNorm.slice(0, -1))
  ) {
    return 1;
  }
  if (toColumn.toLowerCase() === "id" && FK_COLUMN_NAME_PATTERN.test(fromColumn)) {
    return 0.95;
  }
  return 0.85;
}

async function measureOverlap(
  query: SqlQuery,
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn: string,
): Promise<number | null> {
  const from = quoteIdentifier(fromTable);
  const to = quoteIdentifier(toTable);
  const fromCol = quoteIdentifier(fromColumn);
  const toCol = quoteIdentifier(toColumn);

  const rows = await query(`
    WITH sample AS (
      SELECT DISTINCT ${fromCol} AS value
      FROM ${from}
      WHERE ${fromCol} IS NOT NULL
      LIMIT ${String(PROFILE_FK_SAMPLE_SIZE)}
    ),
    matched AS (
      SELECT s.value
      FROM sample s
      WHERE EXISTS (
        SELECT 1 FROM ${to} t WHERE t.${toCol}::VARCHAR = s.value::VARCHAR LIMIT 1
      )
    )
    SELECT
      (SELECT COUNT(*) FROM sample) AS sample_size,
      (SELECT COUNT(*) FROM matched) AS overlap_count
  `);

  const sampleSize = Number(rows[0]?.["sample_size"] ?? 0);
  const overlapCount = Number(rows[0]?.["overlap_count"] ?? 0);
  if (sampleSize === 0) {
    return null;
  }
  return overlapCount / sampleSize;
}

function targetColumnsFor(fromColumn: ColumnProfile, target: TableProfile): ColumnProfile[] {
  const matches: ColumnProfile[] = [];
  for (const column of target.columns) {
    if (isCandidateKey(column, target.rowCount)) {
      matches.push(column);
      continue;
    }
    if (column.name === "id" && FK_COLUMN_NAME_PATTERN.test(fromColumn.name)) {
      matches.push(column);
    }
  }
  return matches;
}

async function candidatesForColumn(
  query: SqlQuery,
  source: TableProfile,
  fromColumn: ColumnProfile,
  targets: TableProfile[],
): Promise<ForeignKeyCandidate[]> {
  const found: ForeignKeyCandidate[] = [];

  for (const target of targets) {
    if (target.table === source.table) {
      continue;
    }
    for (const toColumn of targetColumnsFor(fromColumn, target)) {
      const overlapRatio = await measureOverlap(
        query,
        source.table,
        fromColumn.name,
        target.table,
        toColumn.name,
      );
      if (overlapRatio === null || overlapRatio < PROFILE_FK_OVERLAP_THRESHOLD) {
        continue;
      }
      const alignment = nameAlignmentBonus(fromColumn.name, target.table, toColumn.name);
      found.push({
        targetTable: target.table,
        targetColumn: toColumn.name,
        overlapRatio: Number(overlapRatio.toFixed(3)),
        confidence: Number(Math.min(1, overlapRatio * alignment).toFixed(3)),
      });
    }
  }

  return found
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, PROFILE_FK_CANDIDATES_PER_COLUMN);
}

/** Pairwise value overlap → FK candidates with deterministic confidence. */
export async function enrichRelationCandidates(
  query: SqlQuery,
  report: ProfileReport,
): Promise<ProfileReport> {
  if (report.length > 50) {
    return report;
  }

  const enriched: ProfileReport = [];
  for (const table of report) {
    const columns: ColumnProfile[] = [];
    for (const column of table.columns) {
      if (!looksLikeForeignKeyColumn(column, table.rowCount)) {
        columns.push({ ...column, foreignKeyCandidates: [] });
        continue;
      }
      const foreignKeyCandidates = await candidatesForColumn(query, table, column, report);
      columns.push({ ...column, foreignKeyCandidates });
    }
    enriched.push({ ...table, columns });
  }
  return enriched;
}
