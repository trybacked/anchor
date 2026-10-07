import { parseModelYaml, SemanticModelSchema, type SemanticModel } from "@trybacked/core";
import {
  applyCommands,
  emptySemanticModel,
  validateAuthoringModel,
} from "@trybacked/ontology-authoring";
import { createDatabricksOntologyRegistry } from "@trybacked/infrastructure";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  getLatestOntologyVersion,
  getOntologyDraft,
  getOntologyVersion,
  upsertOntologyDraft,
  type OntologyDraftRow,
} from "../db/ontology-repositories.js";

function databricksAdminConfig(config: ControlPlaneConfig) {
  return {
    host: config.databricksHost.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    token: config.databricksToken,
    warehouseId: config.databricksWarehouseId,
  };
}

/** Prefer UC volume `current.json` when it is at least as new as Postgres. */
export async function resolvePublishedModelForDraftReset(
  pool: pg.Pool,
  tenantId: string,
  catalog: string,
  config: ControlPlaneConfig,
): Promise<{ model: SemanticModel; version: number } | undefined> {
  try {
    const store = createDatabricksOntologyRegistry(databricksAdminConfig(config));
    const remote = await store.loadCurrent(catalog);
    if (remote !== null) {
      return { model: parseModelYaml(remote.modelYaml), version: remote.version };
    }
  } catch {
    // Fall back to Postgres mirror below.
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
  actor: string,
): Promise<OntologyDraftRow> {
  const existing = await getOntologyDraft(pool, tenantId);
  if (existing !== undefined) {
    return existing;
  }
  const latestVersion = await getLatestOntologyVersion(pool, tenantId);
  let model: SemanticModel;
  let basedOn: number | null = null;
  if (latestVersion > 0) {
    const published = await getOntologyVersion(pool, tenantId, latestVersion);
    if (published === undefined) {
      model = emptySemanticModel(`draft-${randomUUID()}`);
    } else {
      model = published.model;
      basedOn = latestVersion;
    }
  } else {
    model = emptySemanticModel(`draft-${randomUUID()}`);
  }
  return upsertOntologyDraft(pool, {
    tenantId,
    revision: 0,
    model,
    basedOnVersion: basedOn,
    updatedBy: actor,
  });
}
export function importModelContent(format: "yaml" | "json", content: string): SemanticModel {
  if (format === "yaml") {
    return parseModelYaml(content);
  }
  return SemanticModelSchema.parse(JSON.parse(content) as unknown);
}
export function validateDraftModel(model: SemanticModel, tenantId: string) {
  return validateAuthoringModel(model, tenantId);
}
export { applyCommands };
