import { parseModelYaml, SemanticModelSchema, type SemanticModel } from "@trybacked/core";
import { createFilesystemOntologyStore } from "@trybacked/infrastructure";
import {
  applyCommands,
  emptySemanticModel,
  validateAuthoringModel,
} from "@trybacked/ontology-authoring";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  getLatestOntologyVersion,
  getOntologyDraft,
  getOntologyVersion,
  upsertOntologyDraft,
  type OntologyDraftRow,
} from "../db/ontology-repositories.js";

export async function resolvePublishedModelForDraftReset(
  pool: pg.Pool,
  tenantId: string,
  catalog: string,
  config: ControlPlaneConfig,
): Promise<{ model: SemanticModel; version: number } | undefined> {
  try {
    const store = createFilesystemOntologyStore({
      registryBasePath: config.filesRegistryRoot,
    });
    const remote = await store.loadCurrent(catalog);
    if (remote !== null) {
      return { model: parseModelYaml(remote.modelYaml), version: remote.version };
    }
  } catch {
    // fall through to Postgres registry
  }

  const pgLatest = await getLatestOntologyVersion(pool, tenantId);
  if (pgLatest > 0) {
    const published = await getOntologyVersion(pool, tenantId, pgLatest);
    if (published !== undefined) {
      return { model: published.model, version: pgLatest };
    }
  }
  return undefined;
}

export async function ensureOntologyDraft(
  pool: pg.Pool,
  tenantId: string,
  catalog: string,
  config: ControlPlaneConfig,
  actor: string,
): Promise<OntologyDraftRow> {
  const existing = await getOntologyDraft(pool, tenantId);
  if (existing !== undefined) {
    return existing;
  }
  const published = await resolvePublishedModelForDraftReset(pool, tenantId, catalog, config);
  const model = published?.model ?? emptySemanticModel(tenantId);
  await upsertOntologyDraft(pool, {
    tenantId,
    revision: 1,
    model,
    basedOnVersion: published?.version ?? null,
    updatedBy: actor,
  });
  const created = await getOntologyDraft(pool, tenantId);
  if (created === undefined) {
    throw new Error("Failed to create ontology draft");
  }
  return created;
}

export function validateDraftModel(model: SemanticModel, tenantId: string) {
  return validateAuthoringModel(SemanticModelSchema.parse(model), tenantId);
}

export function importModelContent(format: "yaml" | "json", content: string): SemanticModel {
  if (format === "yaml") {
    return SemanticModelSchema.parse(parseModelYaml(content));
  }
  const parsed: unknown = JSON.parse(content);
  return SemanticModelSchema.parse(parsed);
}

export { applyCommands };
