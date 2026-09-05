/** Shared contract for ontology-guided row queries — types only, no I/O. */

export interface RowFilter {
  column: string;
  op: "=" | "!=" | ">" | ">=" | "<" | "<=";
  value: string | number;
}

export interface EntityRowRequest {
  table: string;
  filters: RowFilter[];
  orderBy?: string;
  limit: number;
}

export type RowReader = (request: EntityRowRequest) => Promise<Record<string, unknown>[]>;

export const DEFAULT_ROW_LIMIT = 25;
export const MAX_ROW_LIMIT = 200;
