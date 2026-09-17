import { runAnchorPipeline, MissingSemanticModelsError } from "@backed/runner";
import { existsSync } from "node:fs";
import path from "node:path";
import { commandErrorMessage, parseModelArgs } from "../args.js";
import { findWorkspaceRoot } from "../env.js";
import { createCliPipelineProgress, printPipelineSummary } from "../runner-progress.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const modelCommand: CommandHandler = async (args) => {
  const ui = initUi();
  const root = findWorkspaceRoot(process.cwd());
  let parsed;
  try {
    parsed = parseModelArgs(args);
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed model [sources-dir] [--full] [--no-embed]");
    return;
  }
  if (parsed.sourcesDir !== undefined) {
    const absoluteSources = path.resolve(root, parsed.sourcesDir);
    if (!existsSync(absoluteSources)) {
      ui.writeError(`Sources folder not found: ${absoluteSources}`);
      process.exitCode = 1;
      return;
    }
  }
  try {
    const result = await runAnchorPipeline({
      workspaceDir: root,
      ...(parsed.sourcesDir !== undefined ? { sourcesDir: parsed.sourcesDir } : {}),
      forceFull: parsed.forceFull,
      skipEmbed: parsed.skipEmbed,
      progress: createCliPipelineProgress(ui),
    });
    printPipelineSummary(ui, result, parsed.skipEmbed);
  } catch (error) {
    if (error instanceof MissingSemanticModelsError) {
      ui.writeError(error.message);
      process.exitCode = 1;
      return;
    }
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
