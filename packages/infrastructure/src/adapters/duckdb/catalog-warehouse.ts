import type { SqlParameter } from "@trybacked/compiler";
import { join } from "node:path";
import { filesRegistryBaseFromEnv } from "../files/config.js";
import { duckDbQueryCliJson, duckDbRunCli } from "./cli.js";
import { bindNamedParameters } from "./executor.js";
import { ensureWarehouseDuckDbParentDir } from "./sql-statement-executor.js";

export function resolveWarehouseMainDuckDbPath(env: NodeJS.ProcessEnv): string {
  return join(filesRegistryBaseFromEnv(env), "warehouse-main.duckdb");
}

export function resolveTenantWarehouseDuckDbPath(
  env: NodeJS.ProcessEnv,
  catalog: string,
): string {
  return join(filesRegistryBaseFromEnv(env), "tenants", `${catalog}.duckdb`);
}

export function attachCatalogSql(catalog: string, tenantDbPath: string): string {
  const escapedPath = tenantDbPath.replaceAll("'", "''");
  const escapedCatalog = catalog.replaceAll('"', '""');
  return `ATTACH IF NOT EXISTS '${escapedPath}' AS "${escapedCatalog}";`;
}

export function prepareCatalogWarehousePaths(
  env: NodeJS.ProcessEnv,
  catalog: string,
): { mainDbPath: string; tenantDbPath: string; attachSql: string } {
  const tenantDbPath = resolveTenantWarehouseDuckDbPath(env, catalog);
  const mainDbPath = resolveWarehouseMainDuckDbPath(env);
  ensureWarehouseDuckDbParentDir(tenantDbPath);
  ensureWarehouseDuckDbParentDir(mainDbPath);
  return {
    mainDbPath,
    tenantDbPath,
    attachSql: attachCatalogSql(catalog, tenantDbPath),
  };
}

export async function execCatalogWarehouseSql(
  env: NodeJS.ProcessEnv,
  catalog: string,
  sql: string,
): Promise<void> {
  const { mainDbPath, attachSql } = prepareCatalogWarehousePaths(env, catalog);
  duckDbRunCli(mainDbPath, `${attachSql}\n${sql}`);
}

export function createCatalogWarehouseSqlExecutor(options: {
  env: NodeJS.ProcessEnv;
  catalog: string;
}): (sql: string, parameters: SqlParameter[]) => Promise<Record<string, unknown>[]> {
  const { mainDbPath, attachSql } = prepareCatalogWarehousePaths(options.env, options.catalog);
  return async (sql, parameters) => {
    const named: Record<string, string | number | boolean | null> = {};
    for (const parameter of parameters) {
      named[parameter.name] = parameter.value;
    }
    const bound = bindNamedParameters(sql, named);
    return duckDbQueryCliJson(mainDbPath, `${attachSql}\n${bound}`);
  };
}
