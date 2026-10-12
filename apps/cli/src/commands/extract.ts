import { runExtractStage } from "@trybacked/extraction";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const extractCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.EXTRACT)}`);
      return;
    }
    const root = findWorkspaceRoot(process.cwd());
    const result = await runExtractStage({
      workspaceRoot: root,
      tenantId: path.basename(root),
      env: process.env,
    });
    ui.writeSuccess(
      `Materialized ${String(result.tablesCreated)} tables · seeded ${String(result.instancesSeeded)} rows → ${ui.path(result.duckDbPath)}`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
