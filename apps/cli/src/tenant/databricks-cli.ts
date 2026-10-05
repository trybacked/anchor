import { spawnSync } from "node:child_process";
export type DatabricksCliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};
export function runDatabricksCli(
  args: string[],
  options?: {
    profile?: string | undefined;
    cwd?: string | undefined;
  },
): DatabricksCliResult {
  const fullArgs = [...args];
  if (options?.profile !== undefined) {
    fullArgs.push("--profile", options.profile);
  }
  const result = spawnSync("databricks", fullArgs, {
    cwd: options?.cwd,
    encoding: "utf8",
    env: process.env,
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
}
export function runDatabricksCliOrThrow(
  args: string[],
  options?: {
    profile?: string | undefined;
    cwd?: string | undefined;
    label?: string;
  },
): string {
  const result = runDatabricksCli(args, options);
  if (result.exitCode !== 0) {
    const label = options?.label ?? `databricks ${args.join(" ")}`;
    throw new Error(
      `${label} failed (exit ${String(result.exitCode)}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return result.stdout;
}
export function databricksAccessToken(profile: string): string {
  return runDatabricksCliOrThrow(["auth", "token"], { profile, label: "auth token" }).trim();
}
export function databricksJson(
  args: string[],
  options?: {
    profile?: string | undefined;
    cwd?: string | undefined;
    label?: string;
  },
): unknown {
  const stdout = runDatabricksCliOrThrow([...args, "--output", "json"], options);
  return JSON.parse(stdout.trim()) as unknown;
}
export function executeAdminSql(options: {
  profile: string;
  warehouseId: string;
  statement: string;
}): Promise<void> {
  const payload = {
    warehouse_id: options.warehouseId,
    statement: options.statement,
    wait_timeout: "30s",
  };
  const out = runDatabricksCliOrThrow(
    ["api", "post", "/api/2.0/sql/statements", "--json", JSON.stringify(payload)],
    { profile: options.profile, label: "SQL statement" },
  );
  const parsed = JSON.parse(out) as {
    status?: {
      state?: string;
    };
  };
  const state = parsed.status?.state ?? "";
  if (state !== "SUCCEEDED") {
    throw new Error(`SQL failed (${state}): ${options.statement}\n${out}`);
  }
  return Promise.resolve();
}
