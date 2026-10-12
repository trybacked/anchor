import {
  markOntologyPublished,
  ontologyV2ToOntology,
  publicationPath,
  semanticModelToOntology,
  type SemanticModel,
} from "@trybacked/core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PublicationRecordSchema, type PublicationRecord } from "./publication.js";
import { archivePublicationRecord, updateOntologyRegistry } from "./registry.js";
import { readPublicationRecord } from "./publish.js";
import { readWorkspaceModel } from "@trybacked/core";

export function publishWorkspaceOntology(
  root: string,
  options: { ontologyId: string; runId?: string; now?: Date },
): PublicationRecord {
  const workspace = readWorkspaceModel(root);
  const now = options.now ?? new Date();
  const previous = readPublicationRecord(root);
  const version = (previous?.version ?? 0) + 1;
  let ontology;
  let runId = options.runId ?? `run_${String(version)}`;
  if (workspace.format === "ontology_v2") {
    ontology = markOntologyPublished(
      ontologyV2ToOntology(workspace.ontology),
      now.toISOString(),
    );
  } else {
    const model: SemanticModel = workspace.model;
    runId = model.metadata.runId;
    ontology = markOntologyPublished(
      semanticModelToOntology(model, { ontologyId: options.ontologyId, version }),
      now.toISOString(),
    );
  }
  const record = PublicationRecordSchema.parse({
    version,
    publishedAt: now.toISOString(),
    runId,
    ontology,
  });
  const filePath = publicationPath(root);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  archivePublicationRecord(root, record);
  updateOntologyRegistry(root, record, options.ontologyId);
  return record;
}
