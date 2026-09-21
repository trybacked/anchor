import {
  loadPublishedOntology,
  mergeValidationResults,
  readModelYaml,
  semanticModelToOntology,
  validateOntology,
  validateSemanticModel,
  workspacePaths,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const validateCommand: CommandHandler = () => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  const { modelPath } = workspacePaths(root);

  if (!existsSync(modelPath)) {
    ui.writeError(
      `No model.yaml at ${modelPath}. Run "backed review" or copy a model into the workspace.`,
    );
    process.exitCode = 1;
    return;
  }

  const model = readModelYaml(modelPath);
  const modelResult = validateSemanticModel(model);
  const ontology = semanticModelToOntology(model, { ontologyId: root });
  const ontologyResult = validateOntology(ontology);
  let combined = mergeValidationResults(modelResult, ontologyResult);
  const published = loadPublishedOntology(root);
  if (published !== null) {
    combined = mergeValidationResults(combined, validateOntology(published));
  }

  ui.heading("Model validation");
  if (published !== null) {
    ui.detail(ui.dim("Including active published ontology"));
  }
  if (combined.issues.length === 0) {
    ui.log("No issues found.");
    return;
  }

  for (const issue of combined.issues) {
    const prefix = issue.severity === "error" ? ui.error("error") : ui.warn("warning");
    const location = issue.path !== undefined ? ` ${ui.dim(`(${issue.path})`)}` : "";
    ui.log(`${prefix} [${issue.code}] ${issue.message}${location}`);
  }

  if (!combined.valid) {
    process.exitCode = 1;
  }
};
