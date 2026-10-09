import type { SqlExecutor, SqlParameterValue, SqlRow } from "@trybacked/ports";
import { duckDbQueryCliJson, duckDbRunCli } from "./cli.js";

function escapeLiteral(value: SqlParameterValue): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`;
  }
  return "NULL";
}

function bindNamedParameters(
  sql: string,
  parameters?: Record<string, SqlParameterValue> | SqlParameterValue[],
): string {
  if (parameters === undefined || Array.isArray(parameters)) {
    return sql;
  }
  let bound = sql;
  for (const [name, value] of Object.entries(parameters)) {
    bound = bound.replaceAll(`:${name}`, escapeLiteral(value));
  }
  return bound;
}

export function createDuckDbSqlExecutor(dbPath: string): SqlExecutor {
  return {
    execute: (sql, parameters) => {
      const bound = bindNamedParameters(sql, parameters);
      return Promise.resolve(duckDbQueryCliJson(dbPath, bound) as SqlRow[]);
    },
  };
}

export function duckDbExec(dbPath: string, sql: string): Promise<void> {
  duckDbRunCli(dbPath, sql);
  return Promise.resolve();
}
