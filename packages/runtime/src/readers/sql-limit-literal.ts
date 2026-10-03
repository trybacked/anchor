/** Databricks SQL statements API does not bind LIMIT/OFFSET as named parameters. */
export function toSqlLimitLiteral(value: number, max: number): string {
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 0) {
    return "0";
  }
  return String(Math.min(n, max));
}
