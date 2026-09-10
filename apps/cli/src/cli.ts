#!/usr/bin/env node
import { diffCommand, gatewayCommand, initCommand, loginCommand, logoutCommand, modelCommand, reviewCommand, serveCommand, } from "./commands/index.js";
import { loadWorkspaceDotEnv } from "./env.js";
import { COMMANDS as CLI_COMMAND_NAMES, isHelpFlag } from "./config.js";
import { getUi, initUi, printHelp } from "./ui/index.js";
import type { Command } from "./types.js";
export const COMMANDS: readonly Command[] = [
    {
        name: CLI_COMMAND_NAMES.INIT,
        description: "Initialize workspace (interactive document type setup)",
        handler: initCommand,
    },
    {
        name: CLI_COMMAND_NAMES.GATEWAY,
        description: "Save Vercel AI Gateway API key to workspace .env",
        handler: gatewayCommand,
    },
    {
        name: CLI_COMMAND_NAMES.LOGIN,
        description: "Sign in to your Backed account (device authorization)",
        handler: loginCommand,
    },
    {
        name: CLI_COMMAND_NAMES.LOGOUT,
        description: "Sign out of your Backed account on this machine",
        handler: logoutCommand,
    },
    {
        name: CLI_COMMAND_NAMES.MODEL,
        description: "Ingest + profile + semantic → ontology proposal",
        handler: modelCommand,
    },
    {
        name: CLI_COMMAND_NAMES.REVIEW,
        description: "Human review (risk-ranked questions) → model.yaml",
        handler: reviewCommand,
    },
    {
        name: CLI_COMMAND_NAMES.DIFF,
        description: "Compare the last two runs",
        handler: diffCommand,
    },
    {
        name: CLI_COMMAND_NAMES.SERVE,
        description: "Authenticated MCP server on model.yaml (5 deterministic operations)",
        handler: serveCommand,
    },
];
export function printCliHelp(): void {
    printHelp(getUi(), COMMANDS);
}
function loadDotEnv(): void {
    loadWorkspaceDotEnv(process.cwd());
}
async function main(): Promise<void> {
    initUi();
    const [, , commandName, ...args] = process.argv;
    if (!commandName || isHelpFlag(commandName)) {
        printCliHelp();
        return;
    }
    const command = COMMANDS.find((c) => c.name === commandName);
    if (!command) {
        const ui = getUi();
        ui.writeError(`Unknown command: ${commandName}`);
        ui.blank();
        printCliHelp();
        process.exitCode = 1;
        return;
    }
    loadDotEnv();
    await command.handler(args);
}
main().catch((error: unknown) => {
    const ui = getUi();
    ui.writeError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
