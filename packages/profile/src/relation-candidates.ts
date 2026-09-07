import {
    PROFILE_FK_CANDIDATES_PER_COLUMN,
    PROFILE_FK_OVERLAP_THRESHOLD,
    PROFILE_FK_SAMPLE_SIZE,
} from "@backed/core";
import type { ColumnProfile, ForeignKeyCandidate, ProfileReport, TableProfile } from "@backed/core";
import { quoteIdentifier } from "@backed/ingest";
import type { SqlQuery } from "@backed/ingest";
import {
    FK_ALIGNMENT_BASE,
    FK_ALIGNMENT_ID_MATCH,
    FK_ALIGNMENT_STRONG,
    FK_COLUMN_NAME_PATTERN,
    FK_COLUMN_SUFFIX_PATTERN,
    FK_DISTINCT_RATIO_THRESHOLD,
    FK_ENRICHMENT_MAX_TABLES,
    FK_SCORE_DECIMAL_PLACES,
    ID_COLUMN_NAME,
} from "./constants.js";
import { roundScore, toCount } from "./sql-row.js";

function isCandidateKey(column: ColumnProfile, rowCount: number): boolean {
    return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount;
}

function looksLikeForeignKeyColumn(column: ColumnProfile, rowCount: number): boolean {
    if (FK_COLUMN_NAME_PATTERN.test(column.name)) {
        return true;
    }
    return (
        rowCount > 0 &&
        column.distinctCount > 1 &&
        column.distinctCount < rowCount * FK_DISTINCT_RATIO_THRESHOLD
    );
}

export function nameAlignmentBonus(fromColumn: string, toTable: string, toColumn: string): number {
    const fromStem = fromColumn.toLowerCase().replace(FK_COLUMN_SUFFIX_PATTERN, "");
    const tableNorm = toTable.toLowerCase().replace(/_/g, "");
    if (
        fromStem.includes(tableNorm) ||
        tableNorm.startsWith(fromStem) ||
        fromStem.startsWith(tableNorm.slice(0, -1))
    ) {
        return FK_ALIGNMENT_STRONG;
    }
    if (toColumn.toLowerCase() === ID_COLUMN_NAME && FK_COLUMN_NAME_PATTERN.test(fromColumn)) {
        return FK_ALIGNMENT_ID_MATCH;
    }
    return FK_ALIGNMENT_BASE;
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
    const sampleSize = toCount(rows[0]?.["sample_size"] ?? 0);
    const overlapCount = toCount(rows[0]?.["overlap_count"] ?? 0);
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
        if (column.name === ID_COLUMN_NAME && FK_COLUMN_NAME_PATTERN.test(fromColumn.name)) {
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
                overlapRatio: roundScore(overlapRatio, FK_SCORE_DECIMAL_PLACES),
                confidence: roundScore(
                    Math.min(FK_ALIGNMENT_STRONG, overlapRatio * alignment),
                    FK_SCORE_DECIMAL_PLACES,
                ),
            });
        }
    }
    return found
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, PROFILE_FK_CANDIDATES_PER_COLUMN);
}

async function enrichColumn(
    query: SqlQuery,
    table: TableProfile,
    column: ColumnProfile,
    report: ProfileReport,
): Promise<ColumnProfile> {
    if (!looksLikeForeignKeyColumn(column, table.rowCount)) {
        return { ...column, foreignKeyCandidates: [] };
    }
    const foreignKeyCandidates = await candidatesForColumn(query, table, column, report);
    return { ...column, foreignKeyCandidates };
}

async function enrichTableProfile(
    query: SqlQuery,
    table: TableProfile,
    report: ProfileReport,
): Promise<TableProfile> {
    const columns: ColumnProfile[] = [];
    for (const column of table.columns) {
        columns.push(await enrichColumn(query, table, column, report));
    }
    return { ...table, columns };
}

export async function enrichRelationCandidates(
    query: SqlQuery,
    report: ProfileReport,
): Promise<ProfileReport> {
    if (report.length > FK_ENRICHMENT_MAX_TABLES) {
        return report;
    }
    const enriched: ProfileReport = [];
    for (const table of report) {
        enriched.push(await enrichTableProfile(query, table, report));
    }
    return enriched;
}
