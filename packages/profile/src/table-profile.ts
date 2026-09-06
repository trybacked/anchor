import {
  PROFILE_PATTERN_SAMPLE_SIZE,
  PROFILE_TOP_VALUES_LIMIT,
} from "@backed/core";
import type { ColumnProfile, DetectedPattern, TableProfile, TopValue } from "@backed/core";
import { quoteIdentifier } from "@backed/ingest";
import type { Dataset, SqlQuery } from "@backed/ingest";

import { detectPatterns } from "./patterns.js";

const DATE_TYPE_PATTERN = /^(DATE|TIMESTAMP)/;
const FRACTIONAL_TYPE_PATTERN = /^(DOUBLE|FLOAT|DECIMAL)/;

export async function profileDataset(
  query: SqlQuery,
  dataset: Dataset,
): Promise<TableProfile> {
  const table = quoteIdentifier(dataset.tableName);

  const describeRows = await query(`DESCRIBE ${table}`);
  const rowCount = await fetchRowCount(query, table);

  const columns: ColumnProfile[] = [];
  for (const row of describeRows) {
    const name = String(row["column_name"]);
    const sqlType = String(row["column_type"]);
    columns.push(await profileColumn(query, table, name, sqlType, rowCount));
  }

  return {
    table: dataset.tableName,
    sourceFile: dataset.sourceFile,
    rowCount,
    columns,
  };
}

async function fetchRowCount(query: SqlQuery, table: string): Promise<number> {
  const rows = await query(`SELECT COUNT(*) AS row_count FROM ${table}`);
  return toCount(rows[0]?.["row_count"]);
}

async function profileColumn(
  query: SqlQuery,
  table: string,
  name: string,
  sqlType: string,
  rowCount: number,
): Promise<ColumnProfile> {
  const column = quoteIdentifier(name);

  const statsRows = await query(
    `SELECT
       COUNT(*) - COUNT(${column}) AS null_count,
       COUNT(DISTINCT ${column}) AS distinct_count,
       MIN(${column})::VARCHAR AS min_value,
       MAX(${column})::VARCHAR AS max_value
     FROM ${table}`,
  );
  const stats = statsRows[0];
  const nullCount = toCount(stats?.["null_count"]);

  const topValues = await fetchTopValues(query, table, column);
  const patterns = await detectColumnPatterns(query, table, column, sqlType);

  return {
    name,
    sqlType,
    nullCount,
    nullRatio: rowCount === 0 ? 0 : nullCount / rowCount,
    distinctCount: toCount(stats?.["distinct_count"]),
    min: toNullableString(stats?.["min_value"]),
    max: toNullableString(stats?.["max_value"]),
    topValues,
    patterns,
    foreignKeyCandidates: [],
  };
}

async function fetchTopValues(
  query: SqlQuery,
  table: string,
  column: string,
): Promise<TopValue[]> {
  const rows = await query(
    `SELECT ${column}::VARCHAR AS value, COUNT(*) AS count
     FROM ${table}
     WHERE ${column} IS NOT NULL
     GROUP BY value
     ORDER BY count DESC, value ASC
     LIMIT ${String(PROFILE_TOP_VALUES_LIMIT)}`,
  );
  return rows.map((row) => ({
    value: String(row["value"]),
    count: toCount(row["count"]),
  }));
}

async function detectColumnPatterns(
  query: SqlQuery,
  table: string,
  column: string,
  sqlType: string,
): Promise<DetectedPattern[]> {
  // Types already inferred by DuckDB are certain evidence: skip regex.
  if (DATE_TYPE_PATTERN.test(sqlType)) {
    return [{ kind: "date", matchRatio: 1 }];
  }
  if (FRACTIONAL_TYPE_PATTERN.test(sqlType)) {
    return [{ kind: "amount", matchRatio: 1 }];
  }
  if (!sqlType.startsWith("VARCHAR")) {
    return [];
  }

  const rows = await query(
    `SELECT ${column}::VARCHAR AS value
     FROM ${table}
     WHERE ${column} IS NOT NULL
     LIMIT ${String(PROFILE_PATTERN_SAMPLE_SIZE)}`,
  );
  return detectPatterns(rows.map((row) => String(row["value"])));
}

function toCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid SQL count: ${JSON.stringify(value)}`);
  }
  return count;
}

// min/max are cast to VARCHAR in SQL: strings or null arrive here.
function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}
