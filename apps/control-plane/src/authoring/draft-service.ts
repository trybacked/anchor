import { randomUUID } from "node:crypto";
import { parseModelYaml, SemanticModelSchema, type SemanticModel } from "@trybacked/core";
import {
  applyCommands,
  emptySemanticModel,
  validateAuthoringModel,
} from "@trybacked/ontology-authoring";
import type pg from "pg";
import {
  getLatestOntologyVersion,
  getOntologyDraft,
  getOntologyVersion,
  upsertOntologyDraft,
  type OntologyDraftRow,
} from "../db/ontology-repositories.js";

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
