import { clearBackedCredentials, readBackedCredentials } from "../auth/index.js";
import { getUi, initUi } from "../ui/index.js";
import type { CommandHandler } from "../types.js";

export const logoutCommand: CommandHandler = async (args) => {
  initUi();
  const ui = getUi();

  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    ui.log(`${ui.label("Usage:")} ${ui.command("backed logout")}`);
    ui.blank();
    ui.detail("Remove Backed account credentials from this machine.");
    return;
  }

  if (args.some((arg) => arg.startsWith("-"))) {
    ui.writeError("Unknown flag. backed logout takes no options.");
    process.exitCode = 1;
    return;
  }

  const existing = readBackedCredentials();
  if (existing === null) {
    ui.writeWarn("Not signed in to Backed.");
    return;
  }

  clearBackedCredentials();
  ui.writeSuccess(`Signed out ${ui.bold(existing.user.email)}`);
};
