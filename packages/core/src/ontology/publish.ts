import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { publicationPath } from "../audit-log.js";
import type { SemanticModel } from "../model.js";
import { markOntologyPublished } from "./apply-review-lifecycle.js";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";
import {
  archivePublicationRecord,
  restorePublicationVersion,
  updateOntologyRegistry,
} from "./registry.js";
import { semanticModelToOntology } from "./semantic-model-bridge.js";

/**
 *
 */
export function readPublicationRecord(root: string): PublicationRecord | null {
  const filePath = publicationPath(root);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return PublicationRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 *
 */
export function publishSemanticModel(
  root: string,
  model: SemanticModel,
  options: { ontologyId: string; now?: Date },
): PublicationRecord {
  const now = options.now ?? new Date();
  const previous = readPublicationRecord(root);
  const version = (previous?.version ?? 0) + 1;
  const ontology = markOntologyPublished(
    semanticModelToOntology(model, { ontologyId: options.ontologyId, version }),
    now.toISOString(),
  );
  const record = PublicationRecordSchema.parse({
    version,
    publishedAt: now.toISOString(),
    runId: model.metadata.runId,
    ontology,
  });
  const filePath = publicationPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  archivePublicationRecord(root, record);
  updateOntologyRegistry(root, record, options.ontologyId);
  return record;
}

/**
 *
 */
export function rollbackPublication(root: string, version: number): PublicationRecord {
  return restorePublicationVersion(root, version);
}

/**
 *
 */
export function loadPublishedOntology(root: string): PublicationRecord["ontology"] | null {
  const record = readPublicationRecord(root);
  return record?.ontology ?? null;
}
