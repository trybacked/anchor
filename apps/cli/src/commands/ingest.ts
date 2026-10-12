import { filesRootFromEnv, resolveEngineFromEnv } from "@trybacked/infrastructure";
import { runIngest } from "@trybacked/ingest";
import path from "node:path";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

export const ingestCommand: CommandHandler = async (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.INGEST)}`);
      ui.log("  Index and parse documents under BACKED_FILES_ROOT.");
      return;
    }
    resolveEngineFromEnv(process.env);
    const root = findWorkspaceRoot(process.cwd());
    const filesRoot = filesRootFromEnv(process.env, root);
    const tenantId = path.basename(root);
    const result = await runIngest({
      workspaceRoot: root,
      filesRoot,
      tenantId,
      env: process.env,
      onProgress: (event) => {
        if (event.stage === "parse") {
          ui.detail(
            `${event.path} · ${event.status}${event.message !== undefined ? ` · ${event.message}` : ""}`,
          );
        }
      },
    });
    ui.writeSuccess(
      `Ingest complete · parsed ${String(result.parsedCount)} · chunks ${String(result.chunkCount)} · manifest ${ui.path(result.manifestPath)}`,
    );
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
