import type { DatasetProvider } from "@trybacked/core";
import type { OntologyStore } from "@trybacked/registry";
import {
  createFileIndexDatasetProvider,
  createFilesystemOntologyStore,
  createLocalDocumentFileReader,
  ensureFilesRootExists,
  filesRegistryBaseFromEnv,
  filesRootFromEnv,
  tenantFilesRoot,
  type LocalDocumentFileReader,
} from "./adapters/files/index.js";
import { createS3DocumentFileReader, resolveS3StorageConfig } from "./adapters/s3/index.js";

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

export function createDocumentFileReaderFromEnv(
  env: Record<string, string | undefined> = process.env,
  tenantId: string,
  options?: { workspaceRoot?: string },
): LocalDocumentFileReader {
  const s3Config = resolveS3StorageConfig(env, tenantId);
  if (s3Config !== undefined) {
    return createS3DocumentFileReader({ config: s3Config });
  }
  const filesRoot = tenantFilesRoot(env, tenantId, options?.workspaceRoot);
  return createLocalDocumentFileReader(filesRoot);
}
