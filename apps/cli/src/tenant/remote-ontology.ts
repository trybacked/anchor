import {
  createDatabricksBlobStore,
  databricksConfigFromEnv,
  hasDatabricksEnv,
  type DatabricksProviderConfig,
} from "@trybacked/provider-databricks";
import {
  createVolumeOntologyStore,
  type PublicationRecord,
  type RemotePublication,
} from "@trybacked/registry";
import { databricksAccessToken } from "./databricks-cli.js";
import type { TenantsRegistry } from "./registry.js";

function normalizeHost(hostUrl: string): string {
  return hostUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function databricksConfigFromEnrollment(
  registry: TenantsRegistry,
): DatabricksProviderConfig {
  const profile = registry.enrollment.profile;
  const host = normalizeHost(registry.enrollment.host);
  return {
    host,
    token: databricksAccessToken(profile),
    warehouseId: registry.enrollment.warehouse_id,
  };
}

export function canPublishRemoteOntology(env: NodeJS.ProcessEnv = process.env): boolean {
  return hasDatabricksEnv(env);
}

export async function loadRemoteCurrent(catalog: string): Promise<RemotePublication | null> {
  const config = databricksConfigFromEnv(process.env);
  const store = createVolumeOntologyStore(createDatabricksBlobStore(config));
  return store.loadCurrent(catalog);
}

export async function publishOntologyRemote(
  catalog: string,
  record: PublicationRecord,
  modelYaml: string,
  config?: DatabricksProviderConfig,
): Promise<void> {
  const resolved = config ?? databricksConfigFromEnv(process.env);
  const store = createVolumeOntologyStore(createDatabricksBlobStore(resolved));
  await store.publish(catalog, record, modelYaml);
}

export async function publishOntologyRemoteForRegistry(
  registry: TenantsRegistry,
  catalog: string,
  record: PublicationRecord,
  modelYaml: string,
): Promise<void> {
  await publishOntologyRemote(catalog, record, modelYaml, databricksConfigFromEnrollment(registry));
}
