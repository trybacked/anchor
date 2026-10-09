export { createDuckDbSqlExecutor, duckDbExec } from "./executor.js";
export { materializeFoundryRowsToDuckDb, type FoundryTableRows } from "./materialize-foundry.js";
export { listAllArchiveFiles, syncDocumentArchiveToWarehouse } from "./document-archive-index.js";
export { applyFoundryExtractToCatalogWarehouse } from "./apply-foundry-extract-to-catalog.js";
export {
  loadFoundryWarehouseDiscoveryProfile,
  type FoundryWarehouseDiscoveryProfile,
} from "./foundry-warehouse-discovery-profile.js";
export {
  loadFoundryWarehouseDiscoveryProfileFromS3,
  persistFoundryWarehouseDiscoveryProfileSnapshot,
  resolveFoundryWarehouseDiscoveryProfile,
} from "./foundry-warehouse-discovery-snapshot.js";
export {
  createCatalogWarehouseSqlExecutor,
  resolveTenantWarehouseDuckDbPath,
  resolveWarehouseMainDuckDbPath,
} from "./catalog-warehouse.js";
export {
  createSqlStatementExecutorForCatalog,
  createSqlStatementExecutorFromDuckDbPath,
  duckDbPathFromEnv,
  ensureWarehouseDuckDbParentDir,
  resolveWarehouseDuckDbPath,
  type SqlStatementExecutor,
} from "./sql-statement-executor.js";
