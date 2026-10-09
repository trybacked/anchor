import type { DatasetProvider } from "@trybacked/core";

export type SqlIdentifier = string;

export type SqlDialect = {

  quoteIdent: (identifier: SqlIdentifier) => string;

  qualify: (datasetId: string) => string;

  ciContains: (columnSql: string, parameterName: string) => string;

  regexMatch: (columnSql: string, patternParameterName: string) => string | null;

  arrayContains: (columnSql: string, parameterName: string) => string;

  limitOffset: (limit: number, offset?: number) => string;

  param: (index: number) => string;

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

export type WarehouseConnector = {
  provider: DatasetProvider;
  executor: SqlExecutor;
  dialect: SqlDialect;
};
