import { runEvaluation } from "@trybacked/evaluation";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const evalCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const json = args.includes("--json");
    const parsed = parseHelpOnlyArgs(args.filter((arg) => arg !== "--json"));
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.EVAL)} [--json]`);
      return;
    }
    const root = findWorkspaceRoot(process.cwd());
    const report = await runEvaluation({ workspaceRoot: root, env: process.env });
    if (json) {
      ui.log(JSON.stringify(report, null, 2));
    } else {
      ui.writeSuccess(
        `Schema valid: ${String(report.schemaValid)} · CQ coverage: ${(report.competencyCoverage * 100).toFixed(0)}%`,
      );
      for (const issue of report.issues) {
        ui.detail(issue);
      }
    }
    if (!report.schemaValid) {
      process.exitCode = 1;
    }
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
