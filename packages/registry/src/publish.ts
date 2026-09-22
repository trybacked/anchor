import {
  markOntologyPublished,
  publicationPath,
  semanticModelToOntology,
  type SemanticModel,
} from "@trybacked/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";
import {
  archivePublicationRecord,
  restorePublicationVersion,
  updateOntologyRegistry,
} from "./registry.js";

/** Reads the active publication record, or null when absent. */
export function readPublicationRecord(root: string): PublicationRecord | null {
  const filePath = publicationPath(root);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return PublicationRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Publishes a reviewed model as the next ontology version. */
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

/** Restores a previous publication version as active. */
export function rollbackPublication(root: string, version: number): PublicationRecord {
  return restorePublicationVersion(root, version);
}

/** Loads the currently published ontology, or null when nothing is published. */
export function loadPublishedOntology(root: string): PublicationRecord["ontology"] | null {
  const record = readPublicationRecord(root);
  return record?.ontology ?? null;
}
