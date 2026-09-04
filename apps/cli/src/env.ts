import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walk up from cwd until `.backed/config.yaml` is found (or stop at filesystem root). */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let directory = resolve(startDir);
  while (true) {
    if (existsSync(join(directory, ".backed", "config.yaml"))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return resolve(startDir);
    }
    directory = parent;
  }
}

/** Load `.env` from the Anchor workspace root when present. */
export function loadWorkspaceDotEnv(startDir: string = process.cwd()): string {
  const root = findWorkspaceRoot(startDir);
  const envPath = join(root, ".env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Missing .env is fine — shell-provided variables still apply.
  }
  return root;
}
