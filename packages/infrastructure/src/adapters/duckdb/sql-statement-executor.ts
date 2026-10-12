import type { SqlParameter } from "@trybacked/compiler";
import type { SqlParameterValue } from "@trybacked/ports";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { filesRegistryBaseFromEnv } from "../files/config.js";
import { createCatalogWarehouseSqlExecutor } from "./catalog-warehouse.js";
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

export function createSqlStatementExecutorForCatalog(options: {
  env: NodeJS.ProcessEnv;
  catalog: string;
}): SqlStatementExecutor {
  return createCatalogWarehouseSqlExecutor(options);
}

export function duckDbPathFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env["BACKED_DUCKDB_PATH"]?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

export function resolveWarehouseDuckDbPath(env: NodeJS.ProcessEnv): string {
  const configured = duckDbPathFromEnv(env);
  if (configured !== undefined) {
    return configured;
  }
  return join(filesRegistryBaseFromEnv(env), "warehouse.duckdb");
}

export function ensureWarehouseDuckDbParentDir(dbPath: string): void {
  mkdirSync(dirname(dbPath), { recursive: true });
}
