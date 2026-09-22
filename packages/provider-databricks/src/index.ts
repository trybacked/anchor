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

/** Provider + SQL client from `BACKED_DATABRICKS_*` environment variables. */
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
