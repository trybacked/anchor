import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type BackedEngine = "files";

export function resolveEngineFromEnv(
  env: Record<string, string | undefined> = process.env,
): BackedEngine {
  const engine = env["BACKED_ENGINE"]?.trim();
  if (engine !== undefined && engine.length > 0 && engine !== "files") {
    throw new Error(`Unsupported BACKED_ENGINE="${engine}". Only "files" is supported.`);
  }
  return "files";
}

export function filesRootFromEnv(
  env: Record<string, string | undefined> = process.env,
  workspaceRoot?: string,
): string {
  const configured = env["BACKED_FILES_ROOT"]?.trim();
  if (configured !== undefined && configured.length > 0) {
    return resolve(configured);
  }
  if (workspaceRoot !== undefined && workspaceRoot.length > 0) {
    return join(workspaceRoot, "sources");
  }
  return resolve(process.cwd(), "sources");
}

export function tenantFilesRoot(
  env: Record<string, string | undefined>,
  tenantId: string,
  workspaceRoot?: string,
): string {
  const base = filesRootFromEnv(env, workspaceRoot);
  return join(base, tenantId);
}

export function filesRegistryBaseFromEnv(
  env: Record<string, string | undefined> = process.env,
  workspaceRoot?: string,
): string {
  const configured = env["BACKED_FILES_REGISTRY_ROOT"]?.trim();
  if (configured !== undefined && configured.length > 0) {
    return resolve(configured);
  }
  if (workspaceRoot !== undefined && workspaceRoot.length > 0) {
    return join(workspaceRoot, ".backed", "remote-registry");
  }
  return resolve(process.cwd(), ".backed", "remote-registry");
}

export function ensureFilesRootExists(root: string): void {
  if (!existsSync(root)) {
    throw new Error(
      `File source root does not exist: ${root}. Create it or set BACKED_FILES_ROOT to a folder of documents (subfolders become discovery collections).`,
    );
  }
}
