import type { Command } from "../types.js";
import { CLI_NAME, CLI_VERSION } from "../config.js";
import { renderLogo } from "./logo.js";
import type { Ui } from "./format.js";
export function printHelp(ui: Ui, commands: readonly Command[]): void {
    ui.log(renderLogo());
    ui.blank();
    ui.log(`${ui.dim(`v${CLI_VERSION}`)} ${ui.dim("· local-first semantic layer")}`);
    ui.blank();
    ui.log(`${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.dim("<command> [args]")}`);
    ui.blank();
    ui.log(ui.label("Commands:"));
    const nameWidth = Math.max(...commands.map((cmd) => cmd.name.length), 8);
    for (const cmd of commands) {
        ui.log(`  ${ui.command(cmd.name.padEnd(nameWidth))}  ${ui.dim(cmd.description)}`);
    }
}
