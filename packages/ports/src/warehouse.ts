import type { DatasetProvider } from "@trybacked/core";

/**
 * SQL dialect abstraction (Plan Phase 3).
 *
 * The compiler and runtime readers must not emit engine-specific syntax
 * directly: every deviation (identifier quoting, case-insensitive contains,
 * regex matching, parameter style, pagination) goes through the dialect.
 */
export type SqlIdentifier = string;

export type SqlDialect = {
  /** Quote an identifier for safe interpolation. */
  quoteIdent: (identifier: SqlIdentifier) => string;
  /** Qualify a dotted dataset id (e.g. catalog.schema.table) with dialect quoting. */
  qualify: (datasetId: string) => string;
  /** Case-insensitive contains: returns SQL with `:param`-style named parameter. */
  ciContains: (columnSql: string, parameterName: string) => string;
  /** Case-insensitive regex match; returns null when the dialect cannot support it. */
  regexMatch: (columnSql: string, patternParameterName: string) => string | null;
  /** Array membership test for a single value parameter. */
  arrayContains: (columnSql: string, parameterName: string) => string;
  /** LIMIT/OFFSET clause (dialects without LIMIT return the appropriate syntax). */
  limitOffset: (limit: number, offset?: number) => string;
  /** Parameter placeholder rendering for positional index (0-based). */
  param: (index: number) => string;
  /** Whether parameter binding is positional (array) or named (object). */
  paramStyle: "named" | "positional";
};

export type SqlRow = Record<string, unknown>;
export type SqlParameterValue = string | number | boolean | null;

export type SqlExecutor = {
  execute: (
    sql: string,
    parameters?: Record<string, SqlParameterValue> | SqlParameterValue[],
  ) => Promise<SqlRow[]>;
};

/**
 * Warehouse connector: schema introspection + query execution + dialect.
 * Every warehouse adapter (Databricks, Postgres, Snowflake, ...) implements this.
 */
export type WarehouseConnector = {
  provider: DatasetProvider;
  executor: SqlExecutor;
  dialect: SqlDialect;
};