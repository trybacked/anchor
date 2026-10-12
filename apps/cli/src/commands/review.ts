import {
  applyCommandsV2,
  parseChangeSet,
  readOntologyV2Yaml,
  writeOntologyV2Yaml,
} from "@trybacked/core";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

const CHANGE_SET_PATH = ".backed/change-set.json";

export const reviewCommand: CommandHandler = (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.REVIEW)} [--accept-above 0.8] [--json]`);
      return;
    }
    const acceptAboveArg = args.find((arg) => arg.startsWith("--accept-above="));
    const threshold =
      acceptAboveArg !== undefined ? Number.parseFloat(acceptAboveArg.split("=")[1] ?? "0.8") : 0.8;
    const json = args.includes("--json");
    const root = findWorkspaceRoot(process.cwd());
    const changeSetFile = path.join(root, CHANGE_SET_PATH);
    if (!existsSync(changeSetFile)) {
      ui.writeError(`No change set at ${changeSetFile}. Run induction first.`);
      process.exitCode = 1;
      return;
    }
    const changeSet = parseChangeSet(JSON.parse(readFileSync(changeSetFile, "utf8")));
    const ontology = readOntologyV2Yaml(root);
    const accepted = changeSet.changes.filter((change) => change.confidence >= threshold);
    const commands = accepted.map((change) => change.command);
    const next = applyCommandsV2(ontology, commands as Parameters<typeof applyCommandsV2>[1]);
    writeOntologyV2Yaml(root, next);
    const summary = {
      accepted: accepted.length,
      rejected: changeSet.changes.length - accepted.length,
      threshold,
    };
    if (json) {
      ui.log(JSON.stringify(summary, null, 2));
    } else {
      ui.writeSuccess(
        `Applied ${String(summary.accepted)} change(s) at threshold ${String(threshold)}`,
      );
    }
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
