import type { Command } from "../types.js";
import { renderLogo } from "./logo.js";
import type { Ui } from "./format.js";

const VERSION = "0.1.0";

export function printHelp(ui: Ui, commands: readonly Command[]): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(`${ui.dim(`v${VERSION}`)} ${ui.dim("· local-first semantic layer")}`);
  ui.blank();
  ui.log(`${ui.label("Usage:")} ${ui.command("backed")} ${ui.dim("<command> [args]")}`);
  ui.blank();
  ui.log(ui.label("Commands:"));

  const nameWidth = Math.max(...commands.map((cmd) => cmd.name.length), 8);
  for (const cmd of commands) {
    ui.log(`  ${ui.command(cmd.name.padEnd(nameWidth))}  ${ui.dim(cmd.description)}`);
  }
}
