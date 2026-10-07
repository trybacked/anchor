/**
 * Adapter facade for applications (Plan Phase 3c).
 *
 * Applications must import these composition-level symbols from
 * `@trybacked/infrastructure` instead of reaching into adapter packages, so
 * the dependency-cruiser boundary `apps/* -> adapter-*` stays enforced.
 * Engine-specific naming here is transitional: Fase 4+ replaces these calls
 * with capability/binding-driven composition.
 */
export {
  createDatabricksBlobStore,
  createDatabricksDatasetProvider,
  createDatabricksOntologyRegistry,
  createDatabricksFilesClient,
  createDatabricksJobsClient,
  createDatabricksProviderFromEnv,
  createDatabricksSqlClient,
  DatabricksFileExistsError,
  databricksConfigFromEnv,
  hasDatabricksEnv,
} from "@trybacked/adapter-databricks";
export type {
  DatabricksBlobStore,
  DatabricksFilesClient,
  DatabricksJobsClient,
  DatabricksProviderConfig,
  DatabricksSqlClient,
} from "@trybacked/adapter-databricks";