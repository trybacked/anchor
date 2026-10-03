export function sqlCellString(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return fallback;
}

export function sqlCellStringFromKeys(
  row: Record<string, unknown>,
  keys: string[],
  fallback = "",
): string {
  for (const key of keys) {
    const value = sqlCellString(row, key);
    if (value.length > 0) {
      return value;
    }
  }
  return fallback;
}
