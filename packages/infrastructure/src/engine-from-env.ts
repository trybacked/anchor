import type { DatasetProvider } from "@trybacked/core";
import type { OntologyStore } from "@trybacked/registry";
import {
  createFileIndexDatasetProvider,
  createFilesystemOntologyStore,
  ensureFilesRootExists,
  filesRegistryBaseFromEnv,
  filesRootFromEnv,
  tenantFilesRoot,
} from "./adapters/files/index.js";

export {
  resolveEngineFromEnv,
  filesRootFromEnv,
  filesRegistryBaseFromEnv,
  tenantFilesRoot,
  type BackedEngine,
} from "./adapters/files/config.js";

export function createDatasetProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  options?: { workspaceRoot?: string; tenantId?: string },
): DatasetProvider {
  const root =
    options !== undefined && options.tenantId !== undefined && options.tenantId.length > 0
      ? tenantFilesRoot(env, options.tenantId, options.workspaceRoot)
      : filesRootFromEnv(env, options?.workspaceRoot);
  ensureFilesRootExists(root);
  return createFileIndexDatasetProvider({ root });
}

export function createOntologyStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
  options?: { workspaceRoot?: string },
): OntologyStore {
  return createFilesystemOntologyStore({
    registryBasePath: filesRegistryBaseFromEnv(env, options?.workspaceRoot),
  });
}
