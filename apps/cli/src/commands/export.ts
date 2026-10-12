import { readWorkspaceModel } from "@trybacked/core";
import { exportOntologyTurtle } from "@trybacked/interop";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const exportCommand: CommandHandler = (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.EXPORT)} [--out ontology.ttl]`);
      return;
    }
    const outArg = args.find((arg) => arg.startsWith("--out="));
    const root = findWorkspaceRoot(process.cwd());
    const workspace = readWorkspaceModel(root);
    if (workspace.format !== "ontology_v2") {
      throw new Error("Export requires OntologySpec v2 model.yaml");
    }
    const turtle = exportOntologyTurtle(workspace.ontology);
    const outPath = outArg?.split("=")[1] ?? path.join(root, "ontology.ttl");
    writeFileSync(outPath, turtle, "utf8");
    ui.writeSuccess(`Exported → ${ui.path(outPath)}`);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
