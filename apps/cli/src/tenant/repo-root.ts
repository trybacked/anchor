import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const REGISTRY_FILE = "tenants.yaml";
export function findBackedRepoRoot(startDir: string = process.cwd()): string {
  const fromEnv = process.env["BACKED_REPO_ROOT"]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const resolved = resolve(fromEnv);
    if (existsSync(join(resolved, REGISTRY_FILE))) {
      return resolved;
    }
    throw new Error(`BACKED_REPO_ROOT=${fromEnv} does not contain ${REGISTRY_FILE}.`);
  }
  let directory = resolve(startDir);
  for (;;) {
    if (existsSync(join(directory, REGISTRY_FILE))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  throw new Error(
    `Could not find ${REGISTRY_FILE}. Run from the backed repo or set BACKED_REPO_ROOT.`,
  );
}
