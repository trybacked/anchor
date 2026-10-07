/**
 * Composition-level exports for applications.
 * Engine: local files only (`BACKED_FILES_ROOT`, `BACKED_FILES_REGISTRY_ROOT`).
 */
export {
  createDatasetProviderFromEnv,
  createOntologyStoreFromEnv,
  resolveEngineFromEnv,
  filesRootFromEnv,
  filesRegistryBaseFromEnv,
  tenantFilesRoot,
  type BackedEngine,
} from "./engine-from-env.js";
export {
  createFileIndexDatasetProvider,
  createFilesystemOntologyStore,
  createFilesWarehouseConnector,
  createLocalDocumentFileReader,
  type LocalDocumentFileReader,
} from "./adapters/files/index.js";
