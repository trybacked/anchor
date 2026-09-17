/** Narrow unknown JSON values to plain object records at API boundaries. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
