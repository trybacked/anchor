import type { ObjectQuery } from "@trybacked/compiler";
import type { PlanFirstResult } from "./run-plan-first.js";

const THIN_LISTING_MAX_TOTAL_CHARS = 320;
const THIN_LISTING_MAX_AVG_CELL_CHARS = 72;

function stringCellChars(rows: Record<string, unknown>[]): number {
  let total = 0;
  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (typeof value === "string") {
        total += value.trim().length;
      }
    }
  }
  return total;
}

export function isSparseListingProse(result: PlanFirstResult): boolean {
  if (result.result.mode === "count") {
    return false;
  }
  const trimmed = result.answer.trim();
  if (!/^(Ecco|Here are|Ci sono|There are) \*\*\d+\*\*/i.test(trimmed)) {
    return false;
  }
  return trimmed.length < 480;
}

export function isThinWarehouseListing(result: PlanFirstResult): boolean {
  if (result.result.mode === "count") {
    return false;
  }
  const rows = result.result.rows;
  if (rows.length === 0) {
    return true;
  }
  const objectQuery = result.plan.objectQuery as ObjectQuery | undefined;
  const groupBy = objectQuery?.groupBy;
  if (groupBy !== undefined && groupBy.length > 0) {
    return false;
  }
  const totalChars = stringCellChars(rows);
  if (totalChars >= THIN_LISTING_MAX_TOTAL_CHARS) {
    return false;
  }
  const avg = totalChars / rows.length;
  return avg < THIN_LISTING_MAX_AVG_CELL_CHARS;
}
