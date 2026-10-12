import { diffOntology } from "@trybacked/core";
import { readPublicationByVersion, readPublicationRecord } from "@trybacked/registry";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const diffCommand: CommandHandler = (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.DIFF)} [fromVersion] [toVersion]`);
      return;
    }
    const root = findWorkspaceRoot(process.cwd());
    const versions = args.filter((arg) => /^\d+$/.test(arg)).map((arg) => Number.parseInt(arg, 10));
    const current = readPublicationRecord(root);
    if (current === null) {
      ui.writeError("No synced publication found.");
      process.exitCode = 1;
      return;
    }
    const fromVersion = versions[0] ?? Math.max(1, current.version - 1);
    const toVersion = versions[1] ?? current.version;
    const fromRecord = readPublicationByVersion(root, fromVersion);
    const toRecord = readPublicationByVersion(root, toVersion);
    if (fromRecord === null || toRecord === null) {
      ui.writeError("Could not load one or both publication versions.");
      process.exitCode = 1;
      return;
    }
    const diff = diffOntology(fromRecord.ontology, toRecord.ontology, {
      fromVersion,
      toVersion,
    });
    ui.log(JSON.stringify(diff, null, 2));
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
