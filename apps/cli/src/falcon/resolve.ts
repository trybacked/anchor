import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type FalconLaunch = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

const FALCON_BIN_ENV_KEYS = ["FALCON_BIN", "BACKED_FALCON_BIN"] as const;

function findOnPath(binary: string): string | undefined {
  const which = spawnSync("which", [binary], { encoding: "utf8" });
  if (which.status !== 0) {
    return undefined;
  }
  const resolved = which.stdout.trim();
  return resolved.length > 0 ? resolved : undefined;
}

function hasUv(): boolean {
  return findOnPath("uv") !== undefined;
}

function isFalconPyproject(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const raw = readFileSync(filePath, "utf8");
  return /^\s*name\s*=\s*["']falcon["']\s*$/m.test(raw);
}

/** Directory containing falcon's pyproject.toml (monorepo or standalone checkout). */
export function findFalconProjectRoot(startDir: string = process.cwd()): string | undefined {
  let directory = resolve(startDir);
  for (;;) {
    const nested = join(directory, "falcon", "pyproject.toml");
    if (isFalconPyproject(nested)) {
      return join(directory, "falcon");
    }
    const here = join(directory, "pyproject.toml");
    if (isFalconPyproject(here)) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function explicitFalconBin(env: NodeJS.ProcessEnv): string | undefined {
  for (const key of FALCON_BIN_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** True when stdout/stderr looks like Backed's Python `falcon` CLI (not unrelated homonyms on PATH). */
export function looksLikeBackedFalconCliHelp(output: string): boolean {
  const text = output.toLowerCase();
  if (text.includes("ui shadowing")) {
    return true;
  }
  return (
    text.includes("record") &&
    text.includes("distill") &&
    (text.includes("ingest") || text.includes("analyze"))
  );
}

function probeBackedFalconCli(launch: FalconLaunch): boolean {
  const result = spawnSync(launch.command, [...launch.args, "--help"], {
    encoding: "utf8",
    timeout: 4_000,
    cwd: launch.cwd,
    env: launch.env ?? process.env,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  return looksLikeBackedFalconCliHelp(combined);
}

function launchFromProjectRoot(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
): FalconLaunch | undefined {
  if (hasUv()) {
    const uv = findOnPath("uv");
    if (uv !== undefined) {
      return {
        command: uv,
        args: ["run", "--directory", projectRoot, "falcon"],
        cwd: projectRoot,
      };
    }
  }
  const python = findOnPath("python3") ?? findOnPath("python");
  if (python !== undefined) {
    return {
      command: python,
      args: ["-m", "falcon.cli"],
      cwd: projectRoot,
      env: {
        ...env,
        PYTHONPATH: [join(projectRoot, "src"), env.PYTHONPATH].filter(Boolean).join(":"),
      },
    };
  }
  return undefined;
}

/**
 * Resolve how to invoke Falcon: explicit bin → monorepo `uv run` / `python -m` → validated PATH.
 * Generic `falcon` on PATH is ignored unless it responds like the Backed Python CLI.
 */
export function resolveFalconLaunch(
  env: NodeJS.ProcessEnv = process.env,
  startDir: string = process.cwd(),
): FalconLaunch {
  const explicit = explicitFalconBin(env);
  if (explicit !== undefined) {
    return { command: explicit, args: [] };
  }

  const projectRoot = findFalconProjectRoot(startDir);
  if (projectRoot !== undefined) {
    const fromProject = launchFromProjectRoot(env, projectRoot);
    if (fromProject !== undefined) {
      return fromProject;
    }
  }

  const onPath = findOnPath("falcon");
  if (onPath !== undefined) {
    const candidate: FalconLaunch = { command: onPath, args: [] };
    if (probeBackedFalconCli(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Backed Falcon (Python CLI) is not available. From the monorepo use sibling `falcon/` with uv, " +
      "install the package so a real `falcon` CLI is on PATH, or set FALCON_BIN to that executable. " +
      "If another program named `falcon` is on PATH, set FALCON_BIN explicitly.",
  );
}
