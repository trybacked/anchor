/** Last segment of a Unity Catalog table identifier (`catalog.schema.table` → `table`). */
export function warehouseTableShortName(tableId: string): string {
  const trimmed = tableId.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const parts = trimmed.split(".").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? trimmed;
}

export function warehouseTableFqn(catalog: string, schema: string, table: string): string {
  return `${catalog}.${schema}.${table}`;
}

export function warehouseTableIdsMatch(left: string, right: string): boolean {
  return warehouseTableShortName(left).toLowerCase() === warehouseTableShortName(right).toLowerCase();
}
