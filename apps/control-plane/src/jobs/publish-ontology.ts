import {
  buildPublishAuditEvent,
  buildRollbackAuditEvent,
  serializeModelYaml,
  type AuditEvent,
  type SemanticModel,
} from "@trybacked/core";
import { createOntologyStoreFromEnv } from "@trybacked/infrastructure";
import { diffSemanticModels, validateAuthoringModel } from "@trybacked/ontology-authoring";
import { buildRemotePublication, type OntologyStore } from "@trybacked/registry";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  getOntologyDraft,
  getLatestOntologyVersion,
  getOntologyVersion,
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
    method?: "publish" | "rollback" | undefined;

    derivedFromVersion?: number | undefined;
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
  const store = createOntologyStoreFromEnv({
    ...process.env,
    BACKED_FILES_REGISTRY_ROOT: config.filesRegistryRoot,
  });
  const nextVersion = await nextPublicationVersion(pool, store, input);
  const method = input.method ?? "publish";
  const previousVersion = nextVersion - 1;
  const derivedFromVersion =
    input.derivedFromVersion ?? (previousVersion > 0 ? previousVersion : undefined);
  const previous =
    previousVersion > 0
      ? await getOntologyVersion(pool, input.tenantId, previousVersion)
      : undefined;
  const changes =
    previous !== undefined && method === "publish"
      ? diffSemanticModels(previous.model, draft.model)
      : [];
  const { record, modelYaml } = buildRemotePublication(draft.model, {
    ontologyId: input.tenantId,
    version: nextVersion,
    provenance: {
      publishedBy: input.actor,
      method,
      ...(derivedFromVersion !== undefined ? { derivedFromVersion } : {}),
      draftRevision: draft.revision,
      changes,
    },
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
  await recordPublicationAudit(pool, {
    tenantId: input.tenantId,
    actor: input.actor,
    method,
    nextVersion,
    derivedFromVersion,
    draftRevision: draft.revision,
    model: draft.model,
  });
  return { version: nextVersion, artifactPath };
}

async function recordPublicationAudit(
  pool: pg.Pool,
  input: {
    tenantId: string;
    actor: string;
    method: "publish" | "rollback";
    nextVersion: number;
    derivedFromVersion?: number | undefined;
    draftRevision: number;
    model: SemanticModel;
  },
): Promise<void> {
  const recordedAt = new Date().toISOString();
  const runId = input.model.metadata.runId;
  const event: AuditEvent =
    input.method === "rollback"
      ? buildRollbackAuditEvent({
          runId,
          recordedAt,
          fromVersion: input.derivedFromVersion ?? input.nextVersion - 1,
          toVersion: input.nextVersion,
          actor: { id: input.actor },
        })
      : buildPublishAuditEvent({
          runId,
          recordedAt,
          publicationVersion: input.nextVersion,
          actor: { id: input.actor },
        });
  await pool.query(
    `INSERT INTO ontology_changes (id, tenant_id, revision, command, actor)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [event.id, input.tenantId, input.draftRevision, JSON.stringify(event), input.actor],
  );
}

export function exportDraftYaml(model: SemanticModel): string {
  return serializeModelYaml(model);
}
