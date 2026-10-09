import type { SqlParameter } from "@trybacked/compiler";
import type { SqlParameterValue } from "@trybacked/ports";
import { createDuckDbSqlExecutor } from "./executor.js";

export type SqlStatementExecutor = (
  sql: string,
  parameters: SqlParameter[],
) => Promise<Record<string, unknown>[]>;

export function createSqlStatementExecutorFromDuckDbPath(dbPath: string): SqlStatementExecutor {
  const executor = createDuckDbSqlExecutor(dbPath);
  return async (sql, parameters) => {
    const named: Record<string, SqlParameterValue> = {};
    for (const parameter of parameters) {
      named[parameter.name] = parameter.value;
    }
    return executor.execute(sql, named);
  };
}

export function duckDbPathFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env["BACKED_DUCKDB_PATH"]?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}
