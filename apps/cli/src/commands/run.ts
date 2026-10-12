import { filesRootFromEnv, resolveEngineFromEnv } from "@trybacked/infrastructure";
import { runPipeline } from "@trybacked/pipeline";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const runCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.RUN)}`);
      ui.log(
        "  Run ingest → AI induce → AI extract → evaluate → sync (requires AI_GATEWAY_API_KEY).",
      );
      return;
    }
    resolveEngineFromEnv(process.env);
    const root = findWorkspaceRoot(process.cwd());
    const checkpoint = await runPipeline({
      workspaceRoot: root,
      filesRoot: filesRootFromEnv(process.env, root),
      tenantId: path.basename(root),
      env: process.env,
      onStage: (stage, detail) => {
        ui.step(`${stage} · ${detail}`);
      },
    });
    ui.writeSuccess(
      `Pipeline run ${checkpoint.runId} · stages: ${checkpoint.completedStages.join(", ")}`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
