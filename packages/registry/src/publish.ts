import {
  markOntologyPublished,
  parseModelYaml,
  publicationPath,
  semanticModelToOntology,
  serializeModelYaml,
  type SemanticModel,
} from "@trybacked/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PublicationRecordSchema,
  type PublicationProvenance,
  type PublicationProvenanceInput,
  type PublicationRecord,
  buildPublicationProvenance,
} from "./publication.js";
import {
  archivePublicationRecord,
  restorePublicationVersion,
  updateOntologyRegistry,
} from "./registry.js";
export function readPublicationRecord(root: string): PublicationRecord | null {
  const filePath = publicationPath(root);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return PublicationRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function buildPublicationRecord(
  model: SemanticModel,
  options: {
    ontologyId: string;
    version: number;
    now?: Date;
    provenance?: PublicationProvenance | undefined;
  },
): PublicationRecord {
  const now = options.now ?? new Date();
  const ontology = markOntologyPublished(
    semanticModelToOntology(model, { ontologyId: options.ontologyId, version: options.version }),
    now.toISOString(),
  );
  return PublicationRecordSchema.parse({
    version: options.version,
    publishedAt: now.toISOString(),
    runId: model.metadata.runId,
    ontology,
    ...(options.provenance !== undefined ? { provenance: options.provenance } : {}),
  });
}
export function publishSemanticModel(
  root: string,
  model: SemanticModel,
  options: {
    ontologyId: string;
    now?: Date;
  },
): PublicationRecord {
  const now = options.now ?? new Date();
  const previous = readPublicationRecord(root);
  const version = (previous?.version ?? 0) + 1;
  const record = buildPublicationRecord(model, {
    ontologyId: options.ontologyId,
    version,
    now,
  });
  const filePath = publicationPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  archivePublicationRecord(root, record);
  updateOntologyRegistry(root, record, options.ontologyId);
  return record;
}
export function rollbackPublication(root: string, version: number): PublicationRecord {
  return restorePublicationVersion(root, version);
}
export function loadPublishedOntology(root: string): PublicationRecord["ontology"] | null {
  const record = readPublicationRecord(root);
  return record?.ontology ?? null;
}
export function buildRemotePublication(
  model: SemanticModel,
  options: {
    ontologyId: string;
    version: number;
    now?: Date;
    provenance?: PublicationProvenanceInput | undefined;
  },
): {
  record: PublicationRecord;
  modelYaml: string;
} {
  const modelYaml = serializeModelYaml(model);
  const { provenance, ...publicationOptions } = options;
  const record = buildPublicationRecord(model, {
    ...publicationOptions,
    ...(provenance !== undefined
      ? { provenance: buildPublicationProvenance(provenance, modelYaml) }
      : {}),
  });
  return { record, modelYaml };
}
export function parsePublicationModelYaml(modelYaml: string): SemanticModel {
  return parseModelYaml(modelYaml);
}
