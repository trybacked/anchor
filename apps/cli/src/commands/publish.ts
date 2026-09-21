import {
  appendAuditEvents,
  buildPublishAuditEvent,
  listPublicationVersions,
  publishSemanticModel,
  readModelYaml,
  semanticModelToOntology,
  validateOntology,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import path from "node:path";
import { findWorkspaceRoot } from "../env.js";
import { defaultReviewer } from "../reviewer.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const publishCommand: CommandHandler = (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  if (args.some((arg) => arg === "--status" || arg === "-s")) {
    const versions = listPublicationVersions(root);
    ui.heading("Publication registry");
    if (versions.length === 0) {
      ui.log("No publications yet.");
      return;
    }
    for (const entry of versions) {
      ui.log(`  v${String(entry.version)} · ${entry.publishedAt} · run ${entry.runId}`);
    }
    return;
  }
  const modelPath = path.join(root, "model.yaml");

  if (!existsSync(modelPath)) {
    ui.writeError(`No model.yaml at ${modelPath}. Run "backed review" first.`);
    process.exitCode = 1;
    return;
  }

  const model = readModelYaml(modelPath);
  const ontologyId = path.basename(root);
  const preflight = validateOntology(semanticModelToOntology(model, { ontologyId }));
  if (!preflight.valid) {
    ui.writeError('Model does not produce a valid ontology. Run "backed validate" first.');
    process.exitCode = 1;
    return;
  }

  const record = publishSemanticModel(root, model, { ontologyId });
  const actorId = defaultReviewer();
  appendAuditEvents(root, [
    buildPublishAuditEvent({
      runId: model.metadata.runId,
      recordedAt: record.publishedAt,
      publicationVersion: record.version,
      ...(actorId !== undefined ? { actor: { id: actorId } } : {}),
    }),
  ]);

  ui.heading("Publish ontology");
  ui.writeSuccess(
    `Publication v${String(record.version)} → ${ui.path(path.join(root, ".backed", "publication.json"))}`,
  );
  ui.detail(
    `${String(record.ontology.objects.length)} object(s), ${String(record.ontology.relationships.length)} relationship(s) · lifecycle published`,
  );
};
