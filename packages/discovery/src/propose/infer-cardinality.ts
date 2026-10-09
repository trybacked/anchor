import type { Cardinality, ColumnProfile } from "@trybacked/core";

export function inferCardinality(column: ColumnProfile, rowCount: number): Cardinality {
  return rowCount > 0 && column.nullCount === 0 && column.distinctCount === rowCount
    ? "one_to_one"
    : "many_to_one";
}
