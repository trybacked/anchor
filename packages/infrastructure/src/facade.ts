export {
  createDatasetProviderFromEnv,
  createDocumentFileReaderFromEnv,
  createOntologyStoreFromEnv,
  resolveEngineFromEnv,
  filesRootFromEnv,
  filesRegistryBaseFromEnv,
  tenantFilesRoot,
  type BackedEngine,
} from "./engine-from-env.js";
export {
  ontologyRegistryLocationHint,
  resolveOntologyRegistryStorage,
  type OntologyRegistryStorage,
} from "./ontology-store-from-env.js";
export {
  createS3DocumentFileReader,
  resolveS3StorageConfig,
  s3BucketFromEnv,
  s3RegionFromEnv,
} from "./adapters/s3/index.js";
export {
  createFileIndexDatasetProvider,
  createFilesystemOntologyStore,
  createFilesWarehouseConnector,
  createLocalDocumentFileReader,
  createTenantArchiveFromEnv,
  documentIdFromVolumePath,
  type LocalDocumentFileReader,
  type TenantArchive,
  type TenantArchiveEntry,
  type TenantArchiveListResult,
  type TenantArchiveUploadResult,
} from "./adapters/files/index.js";
export {
  createSqlStatementExecutorForCatalog,
  createSqlStatementExecutorFromDuckDbPath,
  duckDbPathFromEnv,
  resolveWarehouseDuckDbPath,
  materializeFoundryRowsToDuckDb,
  syncDocumentArchiveToWarehouse,
  listAllArchiveFiles,
  applyFoundryExtractToCatalogWarehouse,
  loadFoundryWarehouseDiscoveryProfile,
  loadFoundryWarehouseDiscoveryProfileFromS3,
  persistFoundryWarehouseDiscoveryProfileSnapshot,
  resolveFoundryWarehouseDiscoveryProfile,
  type FoundryWarehouseDiscoveryProfile,
  type FoundryTableRows,
  type SqlStatementExecutor,
} from "./adapters/duckdb/index.js";
