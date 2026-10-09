import { createRunId, readWorkspaceConfig, writeModelYaml } from "@trybacked/core";
import {
  buildFoundryDocumentSemanticModel,
  defaultFoundryCatalog,
} from "@trybacked/ontology-extract";
import { isHelpFlag } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function readCatalogArg(args: string[], ontologyId: string): string {
  const catalogArg = args.find((arg) => arg.startsWith("--catalog="));
  if (catalogArg !== undefined) {
    return catalogArg.slice("--catalog=".length).trim();
  }
  return defaultFoundryCatalog(ontologyId);
}

export const ontologyInitFoundryCommand: CommandHandler = (args) => {
  const ui = initUi();
  if (args.some(isHelpFlag)) {
    ui.log("Usage: backed ontology init-foundry [--catalog=backed_<tenant>]");
    ui.log("  Writes model.yaml (Foundry document ontology: organization, person, document, …).");
    ui.log("  Source of truth: @trybacked/ontology-extract buildFoundryDocumentSemanticModel.");
    return;
  }

  const root = findWorkspaceRoot(process.cwd());
  const runId = createRunId();
  let ontologyId = "default";
  try {
    ontologyId = readWorkspaceConfig(root).ontologyId ?? ontologyId;
  } catch {
    /* workspace may only have .backed/config.yaml */
  }
  const catalog = readCatalogArg(args, ontologyId);
  const generatedAt = new Date();
  const model = buildFoundryDocumentSemanticModel({
    catalog,
    runId,
    generatedAt: generatedAt.toISOString(),
    sourceDir: root,
  });
  const modelPath = writeModelYaml(root, model);
  ui.writeSuccess(`Foundry model → ${ui.path(modelPath)}`);
  ui.detail(
    `${String(model.entities.length)} object type(s), ${String(model.relations.length)} link type(s) · catalog ${catalog}`,
  );
  ui.step(
    'Run "backed ontology extract-foundry", "backed ontology materialize-foundry", then "backed anchor sync".',
  );
};
