import { CLI_NAME, CLI_VERSION, SERVICES } from "../config.js";
import type { Command } from "../types.js";
import type { Ui } from "./format.js";
import { renderLogo } from "./logo.js";

export function printRootHelp(ui: Ui): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(`${ui.dim(`v${CLI_VERSION}`)} ${ui.dim("· Backed CLI")}`);
  ui.blank();
  ui.log(`${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.dim("<command> [args]")}`);
  ui.blank();
  ui.log(ui.label("Commands:"));
  ui.log(`  ${ui.command("version".padEnd(8))}  ${ui.dim("Print CLI version")}`);
  ui.log(
    `  ${ui.command(SERVICES.ANCHOR.padEnd(8))}  ${ui.dim("Ontology engine (pull, sync, deploy)")}`,
  );
  ui.blank();
  ui.log(
    `${ui.dim("Run")} ${ui.command(`${CLI_NAME} ${SERVICES.ANCHOR}`)} ${ui.dim("for the full command list.")}`,
  );
}

export function printAnchorHelp(ui: Ui, commands: readonly Command[]): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(
    `${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.command(SERVICES.ANCHOR)} ${ui.dim("<command> [args]")}`,
  );
  ui.blank();
  ui.log(ui.label("Commands:"));
  const nameWidth = Math.max(...commands.map((cmd) => cmd.name.length), 8);
  for (const cmd of commands) {
    ui.log(`  ${ui.command(cmd.name.padEnd(nameWidth))}  ${ui.dim(cmd.description)}`);
  }
}

export function printHelp(ui: Ui, commands: readonly Command[]): void {
  printAnchorHelp(ui, commands);
}
