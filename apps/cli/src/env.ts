import { workspacePaths } from "@trybacked/core";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSPACE_ENV_FILE } from "./config.js";

const DOTENV_BACKFILL_KEYS = ["AI_GATEWAY_API_KEY", "SEMANTIC_MODEL"] as const;

export function workspaceEnvPath(root: string): string {
  return join(root, WORKSPACE_ENV_FILE);
}

/** Anchor monorepo root (directory that contains `apps/cli`), when running the bundled CLI. */
export function resolveAnchorMonorepoRoot(): string | null {
  const cliModuleDir = dirname(fileURLToPath(import.meta.url));
  const anchorRoot = resolve(cliModuleDir, "../../..");
  const marker = join(anchorRoot, "apps", "cli", "package.json");
  if (!existsSync(marker)) {
    return null;
  }
  return anchorRoot;
}

export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let directory = resolve(startDir);
  for (;;) {
    if (existsSync(workspacePaths(directory).configPath)) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return resolve(startDir);
    }
    directory = parent;
  }
}

/** Paths to `.env` from cwd up to filesystem root (nearest directory first). */
export function dotEnvPathsFromCwd(startDir: string = process.cwd()): string[] {
  const paths: string[] = [];
  let directory = resolve(startDir);
  for (;;) {
    paths.push(join(directory, WORKSPACE_ENV_FILE));
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return paths;
}

/**
 * Order used by {@link loadWorkspaceDotEnv}: anchor defaults, then ancestors, then cwd (later passes do not overwrite).
 */
export function dotEnvLoadOrder(startDir: string = process.cwd()): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (envPath: string): void => {
    const normalized = resolve(envPath);
    if (seen.has(normalized) || !existsSync(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  };

  const anchorRoot = resolveAnchorMonorepoRoot();
  if (anchorRoot !== null) {
    push(join(anchorRoot, WORKSPACE_ENV_FILE));
  }

  const cwdChain = dotEnvPathsFromCwd(startDir);
  for (let index = cwdChain.length - 1; index >= 0; index -= 1) {
    const envPath = cwdChain[index];
    if (envPath !== undefined) {
      push(envPath);
    }
  }

  return ordered;
}

function clearEmptyDotenvBackfillKeys(): void {
  for (const key of DOTENV_BACKFILL_KEYS) {
    if (process.env[key]?.trim() === "") {
      Reflect.deleteProperty(process.env, key);
    }
  }
}

/**
 * Load `.env` files: anchor monorepo defaults, then cwd → root (tenant `.env` wins over anchor).
 * `process.loadEnvFile` does not overwrite — load order is farthest-to-nearest on the cwd chain after anchor.
 */
export function loadWorkspaceDotEnv(startDir: string = process.cwd()): string {
  clearEmptyDotenvBackfillKeys();
  for (const envPath of dotEnvLoadOrder(startDir)) {
    process.loadEnvFile(envPath);
  }
  return findWorkspaceRoot(startDir);
}
