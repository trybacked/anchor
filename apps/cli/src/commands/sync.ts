import {
  appendAuditEvents,
  buildPublishAuditEvent,
  readModelYaml,
  semanticModelToOntology,
  validateOntology,
} from "@trybacked/core";
import { listPublicationVersions, publishSemanticModel } from "@trybacked/registry";
import { existsSync } from "node:fs";
import path from "node:path";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import { defaultReviewer } from "../reviewer.js";
import type { CommandHandler } from "../types.js";
import { initUi, type Ui } from "../ui/index.js";

function formatValidationErrors(ui: Ui, result: ReturnType<typeof validateOntology>): void {
  for (const issue of result.issues) {
    const prefix = issue.severity === "error" ? ui.error("error") : ui.warn("warning");
    const location = issue.path !== undefined ? ` ${ui.dim(`(${issue.path})`)}` : "";
    ui.log(`${prefix} [${issue.code}] ${issue.message}${location}`);
  }
}

export const syncCommand: CommandHandler = (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    ui.log(`Usage: ${formatCliCommand(COMMANDS.SYNC)} [--status]`);
    ui.log("  Snapshot model.yaml into the local registry (.backed/, versioned).");
    ui.log("  Required before deploy can run query_objects on warehouse mappings.");
    return;
  }
  if (args.some((arg) => arg === "--status" || arg === "-s")) {
    const versions = listPublicationVersions(root);
    ui.heading("Registry");
    if (versions.length === 0) {
      ui.log("No synced versions yet.");
      return;
    }
    for (const entry of versions) {
      ui.log(`  v${String(entry.version)} · ${entry.publishedAt} · run ${entry.runId}`);
    }
    return;
  }
  const modelPath = path.join(root, "model.yaml");

  if (!existsSync(modelPath)) {
    ui.writeError(`No model.yaml at ${modelPath}. Run "${formatCliCommand(COMMANDS.PULL)}" first.`);
    process.exitCode = 1;
    return;
  }

  const model = readModelYaml(modelPath);
  const ontologyId = path.basename(root);
  const preflight = validateOntology(semanticModelToOntology(model, { ontologyId }));
  if (!preflight.valid) {
    ui.writeError("model.yaml is not a valid ontology:");
    formatValidationErrors(ui, preflight);
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

  ui.heading("Sync ontology");
  ui.writeSuccess(
    `Registry v${String(record.version)} → ${ui.path(path.join(root, ".backed", "publication.json"))}`,
  );
  ui.detail(
    `${String(record.ontology.objects.length)} object(s), ${String(record.ontology.relationships.length)} relationship(s) · active for deploy`,
  );
};
