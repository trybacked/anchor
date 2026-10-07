import { type DatabricksProviderConfig } from "./config.js";
import { createDatabricksBlobStore } from "./files-client.js";
import { createVolumeOntologyStore, type OntologyStore } from "@trybacked/registry";

export type DatabricksOntologyRegistryLayout = {
  /** Absolute engine-specific base; defaults to the UC volumes root. */
  root?: string | undefined;
  schema?: string | undefined;
  volume?: string | undefined;
};

/**
 * Volume-backed ontology registry resolved from the Databricks config
 * (Plan Fase 3b): the `/Volumes/<catalog>/...` layout lives here, with the
 * adapter — never in the registry or kernel packages.
 */
export function createDatabricksOntologyRegistry(
  config: DatabricksProviderConfig,
  layout: DatabricksOntologyRegistryLayout = {},
): OntologyStore {
  const blobs = createDatabricksBlobStore(config);
  return createVolumeOntologyStore(blobs, {
    // UC volumes are per-tenant catalog; the store derives the final path from
    // the catalog argument of each load/publish call.
    root: layout.root ?? "/Volumes",
    schema: layout.schema ?? "backed",
    volume: layout.volume ?? "registry",
  });
}
