import { DEFAULT_WORKSPACE_CONFIG, workspacePaths, writeWorkspaceConfig } from "@trybacked/core";
import { existsSync } from "node:fs";
import { commandErrorMessage, parseHelpOnlyArgs } from "../args.js";
import { initNextStep } from "../messages.js";
import type { CommandHandler } from "../types.js";
import { initUi, renderLogo } from "../ui/index.js";

export const initCommand: CommandHandler = (args) => {
  const ui = initUi();
  let parsed;
  try {
    parsed = parseHelpOnlyArgs(args.filter((arg) => arg !== "-y" && arg !== "--yes"));
  } catch (error) {
    ui.writeError(commandErrorMessage(error));
    process.exitCode = 1;
    return;
  }
  if (parsed.help) {
    ui.log("Usage: backed init");
    ui.log("  Creates .backed/config.yaml in the current directory.");
    return;
  }
  const root = process.cwd();
  const alreadyInitialized = existsSync(workspacePaths(root).configPath);
  const configPath = writeWorkspaceConfig(root, DEFAULT_WORKSPACE_CONFIG);
  ui.log(renderLogo());
  ui.blank();
  ui.writeSuccess(`Workspace ${alreadyInitialized ? "updated" : "initialized"} → ${configPath}`);
  ui.step(initNextStep());
};
