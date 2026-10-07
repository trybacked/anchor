import type { SqlDialect } from "@trybacked/ports";

/**
 * SQL dialect registry (Plan Phase 3b).
 *
 * Engine-specific SQL surface lives here and is injected into the compiler;
 * the compiler itself no longer assumes Spark/Databricks syntax.
 */
export const sparkDialect: SqlDialect = {
  paramStyle: "named",
  param: (index) => `:p${String(index)}`,
  quoteIdent: (identifier) => `\`${identifier.replaceAll("`", "``")}\``,
  qualify: (datasetId) => datasetId.split(".").map(sparkDialect.quoteIdent).join("."),
  ciContains: (columnSql, parameterName) => `LOWER(${columnSql}) LIKE LOWER(:${parameterName})`,
  regexMatch: (columnSql, parameterName) => `${columnSql} RLIKE :${parameterName}`,
  arrayContains: (columnSql, parameterName) => `${columnSql} IN (:${parameterName})`,
  limitOffset: (limit, offset) =>
    offset !== undefined && offset > 0
      ? ` LIMIT ${String(limit)} OFFSET ${String(offset)}`
      : ` LIMIT ${String(limit)}`,
};

export const postgresDialect: SqlDialect = {
  // The compiler always emits named `:name` placeholders; the Postgres adapter
  // translates them to positional `$n` bindings at execution time.
  paramStyle: "named",
  param: (index) => `:p${String(index)}`,
  quoteIdent: (identifier) => `"${identifier.replaceAll('"', '""')}"`,
  qualify: (datasetId) => datasetId.split(".").map(postgresDialect.quoteIdent).join("."),
  ciContains: (columnSql, parameterName) => `${columnSql} ILIKE :${parameterName}`,
  regexMatch: (columnSql, parameterName) => `${columnSql} ~* :${parameterName}`,
  arrayContains: (columnSql, parameterName) => `${columnSql} = ANY(:${parameterName})`,
  limitOffset: (limit, offset) =>
    offset !== undefined && offset > 0
      ? ` LIMIT ${String(limit)} OFFSET ${String(offset)}`
      : ` LIMIT ${String(limit)}`,
};

const DIALECTS: Record<string, SqlDialect> = {
  spark: sparkDialect,
  postgres: postgresDialect,
};

export function resolveSqlDialect(name: string | undefined): SqlDialect {
  if (name === undefined || name.length === 0) {
    return sparkDialect;
  }
  const dialect = DIALECTS[name];
  if (dialect === undefined) {
    throw new Error(
      `Unknown SQL dialect "${name}". Available: ${Object.keys(DIALECTS).join(", ")}`,
    );
  }
  return dialect;
}
