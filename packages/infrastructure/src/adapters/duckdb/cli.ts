import { execFileSync, spawnSync } from "node:child_process";

export function resolveDuckDbBinary(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env["DUCKDB_BIN"]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  const which = spawnSync("which", ["duckdb"], { encoding: "utf8" });
  if (which.status === 0) {
    const path = which.stdout.trim();
    if (path.length > 0) {
      return path;
    }
  }
  throw new Error(
    'DuckDB CLI not found. Install with "brew install duckdb" or set DUCKDB_BIN to the duckdb binary.',
  );
}

export function duckDbRunCli(
  dbPath: string,
  sql: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const binary = resolveDuckDbBinary(env);
  execFileSync(binary, [dbPath, "-c", sql], { stdio: "pipe", encoding: "utf8" });
}

export function duckDbQueryCliJson(
  dbPath: string,
  sql: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown>[] {
  const binary = resolveDuckDbBinary(env);
  const output = execFileSync(binary, [dbPath, "-json", "-c", sql], {
    stdio: "pipe",
    encoding: "utf8",
  });
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as Record<string, unknown>[] | Record<string, unknown>;
  return Array.isArray(parsed) ? parsed : [parsed];
}
