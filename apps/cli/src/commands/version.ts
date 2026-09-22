import { CLI_NAME, CLI_VERSION } from "../config.js";
import type { CommandHandler } from "../types.js";
import { getUi, initUi } from "../ui/index.js";

export function printCliVersion(): void {
  const ui = getUi();
  ui.log(`${CLI_NAME} ${CLI_VERSION}`);
}

export const versionCommand: CommandHandler = (args) => {
  initUi();
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    const ui = getUi();
    ui.log(`Usage: ${CLI_NAME} version`);
    ui.log("  Print CLI version.");
    return;
  }
  printCliVersion();
};
