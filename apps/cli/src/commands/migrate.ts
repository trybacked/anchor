import {
  createRunId,
  migrateOntologyV1ToV2,
  readModelYaml,
  semanticModelToOntology,
  writeOntologyV2Yaml,
} from "@trybacked/core";
import { existsSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function resolveOntologyId(root: string): string {
  return path.basename(root);
}

export const migrateCommand: CommandHandler = async (args) => {
  const ui = initUi();
  let parsed;
  try {
    parsed = parseHelpOnlyArgs(args);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log(`Usage: ${formatCliCommand("migrate")} [--dry-run]`);
    ui.log("  Upgrade model.yaml from semantic format v1 to OntologySpec v2.");
    return;
  }
  const dryRun = args.some((arg) => arg === "--dry-run");
  const root = findWorkspaceRoot(process.cwd());
  const modelPath = path.join(root, "model.yaml");
  if (!existsSync(modelPath)) {
    ui.writeError(`No model.yaml at ${modelPath}.`);
    process.exitCode = 1;
    return;
  }
  try {
    const model = readModelYaml(root);
    const ontologyId = resolveOntologyId(root);
    const v1 = semanticModelToOntology(model, { ontologyId, version: 1 });
    const v2 = migrateOntologyV1ToV2(v1);
    const runId = createRunId();
    v2.metadata = {
      ...v2.metadata,
      version: Math.max(v2.metadata.version, 1),
      generatedAt: new Date().toISOString(),
    };
    if (dryRun) {
      ui.writeSuccess(
        `Dry run: would write OntologySpec v2 (${String(v2.objectTypes.length)} object types, ${String(v2.linkTypes.length)} links). Run ${runId}`,
      );
      return;
    }
    const out = writeOntologyV2Yaml(root, v2);
    ui.writeSuccess(`Migrated → ${ui.path(out)} (OntologySpec v2)`);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
