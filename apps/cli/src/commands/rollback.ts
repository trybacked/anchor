import { rollbackPublication } from "@trybacked/registry";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const rollbackCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.ROLLBACK)} <version>`);
      return;
    }
    const versionArg = args.find((arg) => /^\d+$/.test(arg));
    if (versionArg === undefined) {
      ui.writeError("Missing version number.");
      process.exitCode = 1;
      return;
    }
    const root = findWorkspaceRoot(process.cwd());
    const record = rollbackPublication(root, Number.parseInt(versionArg, 10));
    ui.writeSuccess(`Rolled back to v${String(record.version)}`);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
