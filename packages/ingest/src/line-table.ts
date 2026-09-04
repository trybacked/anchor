import { quoteIdentifier, quoteString } from "./sql.js";
import type { SqlQuery } from "./types.js";

export interface LineRow {
  page: number;
  line: number;
  text: string;
}

export const LINE_INSERT_BATCH_SIZE = 200;

export async function registerLineTable(
  query: SqlQuery,
  tableName: string,
  rows: LineRow[],
): Promise<void> {
  await query(
    `CREATE TABLE ${quoteIdentifier(tableName)} (page INTEGER, line INTEGER, text VARCHAR)`,
  );

  for (let offset = 0; offset < rows.length; offset += LINE_INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + LINE_INSERT_BATCH_SIZE);
    const values = batch
      .map(
        (row) =>
          `(${String(row.page)}, ${String(row.line)}, ${quoteString(row.text)})`,
      )
      .join(", ");
    await query(`INSERT INTO ${quoteIdentifier(tableName)} VALUES ${values}`);
  }
}

export function linesFromPlainText(text: string): LineRow[] {
  const rows: LineRow[] = [];
  let lineNum = 0;
  for (const raw of text.split(/\r?\n/u)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    lineNum += 1;
    rows.push({ page: 1, line: lineNum, text: trimmed });
  }
  return rows;
}
