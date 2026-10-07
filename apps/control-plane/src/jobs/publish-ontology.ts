import { serializeModelYaml, type SemanticModel } from "@trybacked/core";
import { createFilesystemOntologyStore } from "@trybacked/infrastructure";
import { validateAuthoringModel } from "@trybacked/ontology-authoring";
import { buildRemotePublication, type OntologyStore } from "@trybacked/registry";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  getOntologyDraft,
  getLatestOntologyVersion,
  insertOntologyVersion,
} from "../db/ontology-repositories.js";

export async function nextPublicationVersion(
  pool: pg.Pool,
  store: OntologyStore,
  input: { tenantId: string; catalog: string },
): Promise<number> {
  const [mirrored, remote] = await Promise.all([
    getLatestOntologyVersion(pool, input.tenantId),
    store.loadCurrent(input.catalog),
  ]);
  return Math.max(mirrored, remote?.version ?? 0) + 1;
}

export async function runPublishOntologyJob(
  pool: pg.Pool,
  config: ControlPlaneConfig,
  input: {
    tenantId: string;
    catalog: string;
    actor: string;
    notes?: string | undefined;
  },
): Promise<{
  version: number;
  artifactPath: string;
}> {
  const draft = await getOntologyDraft(pool, input.tenantId);
  if (draft === undefined) {
    throw new Error("No ontology draft to publish");
  }
  const validation = validateAuthoringModel(draft.model, input.tenantId);
  if (!validation.valid) {
    const message = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("; ");
    throw new Error(message.length > 0 ? message : "Draft validation failed");
  }
  const store = createFilesystemOntologyStore({
    registryBasePath: config.filesRegistryRoot,
  });
  const nextVersion = await nextPublicationVersion(pool, store, input);
  const { record, modelYaml } = buildRemotePublication(draft.model, {
    ontologyId: input.tenantId,
    version: nextVersion,
  });
  await store.publish(input.catalog, record, modelYaml);
  const artifactPath = `${config.filesRegistryRoot}/${input.catalog}/backed/registry/publications/v${String(nextVersion)}.json`;
  await insertOntologyVersion(pool, {
    tenant_id: input.tenantId,
    version: nextVersion,
    model: draft.model,
    ontology: record.ontology,
    published_by: input.actor,
    notes: input.notes ?? null,
    artifact_path: artifactPath,
  });
  return { version: nextVersion, artifactPath };
}

export function exportDraftYaml(model: SemanticModel): string {
  return serializeModelYaml(model);
}
