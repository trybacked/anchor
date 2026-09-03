import { quotedIdentifier, quotedString } from "@duckdb/node-api";

export function quoteIdentifier(name: string): string {
  return quotedIdentifier(name);
}

export function quoteString(value: string): string {
  return quotedString(value);
}
