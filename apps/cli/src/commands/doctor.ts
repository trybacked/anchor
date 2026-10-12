import { requireAiGatewayApiKey, resolveEngineFromEnv } from "@trybacked/infrastructure";
import { spawnSync } from "node:child_process";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { COMMANDS, formatCliCommand } from "../config.js";
import { dotEnvLoadOrder } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function checkBinary(name: string): boolean {
  const which = spawnSync("which", [name], { encoding: "utf8" });
  return which.status === 0 && which.stdout.trim().length > 0;
}

export const doctorCommand: CommandHandler = (args) => {
  const ui = initUi();
  try {
    const parsed = parseHelpOnlyArgs(args);
    if (parsed.help) {
      ui.log(`Usage: ${formatCliCommand(COMMANDS.DOCTOR)}`);
      return;
    }
    let ok = true;
    try {
      resolveEngineFromEnv(process.env);
      ui.writeSuccess("BACKED_ENGINE configured");
    } catch (error) {
      ok = false;
      ui.writeError(commandErrorMessage(error));
    }
    if (process.env["BACKED_FILES_ROOT"]?.trim()) {
      ui.writeSuccess(`BACKED_FILES_ROOT=${process.env["BACKED_FILES_ROOT"]}`);
    } else {
      ui.detail("BACKED_FILES_ROOT not set (defaults to workspace/sources)");
    }
    const loadedEnvFiles = dotEnvLoadOrder(process.cwd());
    if (loadedEnvFiles.length > 0) {
      ui.detail(`Loaded .env (defaults → tenant): ${loadedEnvFiles.join(" → ")}`);
    } else {
      ui.detail(
        "No .env found walking up from cwd — set AI_GATEWAY_API_KEY in the shell or add anchor/.env",
      );
    }
    try {
      requireAiGatewayApiKey(process.env);
      ui.writeSuccess("AI_GATEWAY_API_KEY set (required for anchor run / induce / extract)");
    } catch (error) {
      ok = false;
      ui.writeError(commandErrorMessage(error));
    }
    if (checkBinary("duckdb")) {
      ui.writeSuccess("duckdb CLI available");
    } else {
      ui.detail("duckdb CLI not found (optional; set BACKED_DUCKDB_PATH for embedded warehouse)");
    }
    if (!ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
  }
};
