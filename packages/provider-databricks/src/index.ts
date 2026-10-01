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
export { createDatabricksFilesClient, normalizeDatabricksVolumePath } from "./files-client.js";
export type {
  DatabricksBlobStore,
  DatabricksFileReadResult,
  DatabricksFilesClient,
} from "./files-client.js";
export { createDatabricksBlobStore } from "./files-client.js";

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
