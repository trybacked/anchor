import { databricksConfigFromEnv } from "./config.js";
import { createDatabricksDatasetProvider } from "./databricks-dataset-provider.js";
import { createDatabricksSqlClient } from "./sql-client.js";
export {
  DatabricksProviderConfigSchema,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "./config.js";
export type { DatabricksProviderConfig } from "./config.js";
export {
  createDatabricksDatasetProvider,
  createDatabricksDatasetProviderFromClient,
} from "./databricks-dataset-provider.js";
export type { CreateDatabricksDatasetProviderOptions } from "./databricks-dataset-provider.js";
export { createDatabricksSqlClient } from "./sql-client.js";
export type { DatabricksSqlClient, SqlParameter, SqlParameterValue, SqlRow } from "./sql-client.js";
export {
  createDatabricksFilesClient,
  createDatabricksBlobStore,
  DatabricksFileExistsError,
  normalizeDatabricksVolumePath,
} from "./files-client.js";
export type {
  DatabricksBlobStore,
  DatabricksDirectoryEntry,
  DatabricksFileReadResult,
  DatabricksFileStat,
  DatabricksFilesClient,
} from "./files-client.js";
export {
  createDatabricksOntologyRegistry,
  type DatabricksOntologyRegistryLayout,
} from "./registry.js";
export { createDatabricksJobsClient } from "./jobs-client.js";
export type {
  DatabricksJobRunResult,
  DatabricksJobRunState,
  DatabricksJobsClient,
} from "./jobs-client.js";
export function createDatabricksProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
) {
  const config = databricksConfigFromEnv(env);
  const client = createDatabricksSqlClient(config);
  return {
    config,
    client,
    provider: createDatabricksDatasetProvider({ config, client }),
  };
}
