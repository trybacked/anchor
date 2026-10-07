import { createOntologyStoreFromEnv, filesRegistryBaseFromEnv } from "@trybacked/infrastructure";
import { type PublicationRecord, type RemotePublication } from "@trybacked/registry";

export function canPublishRemoteOntology(env: NodeJS.ProcessEnv = process.env): boolean {
  const root = env["BACKED_FILES_REGISTRY_ROOT"]?.trim();
  return root !== undefined && root.length > 0;
}

export async function loadRemoteCurrent(catalog: string): Promise<RemotePublication | null> {
  const store = createOntologyStoreFromEnv(process.env);
  return store.loadCurrent(catalog);
}

export async function publishOntologyRemote(
  catalog: string,
  record: PublicationRecord,
  modelYaml: string,
): Promise<void> {
  const store = createOntologyStoreFromEnv(process.env);
  await store.publish(catalog, record, modelYaml);
}

export async function publishOntologyRemoteForRegistry(
  _registry: unknown,
  catalog: string,
  record: PublicationRecord,
  modelYaml: string,
): Promise<void> {
  await publishOntologyRemote(catalog, record, modelYaml);
}

export function remoteRegistryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return filesRegistryBaseFromEnv(env);
}
