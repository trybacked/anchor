#!/usr/bin/env node
import {
  diffCommand,
  gatewayCommand,
  initCommand,
  loginCommand,
  logoutCommand,
  modelCommand,
  reviewCommand,
  serveCommand,
} from "./commands/index.js";
import { loadWorkspaceDotEnv } from "./env.js";
import { getUi, initUi, printHelp } from "./ui/index.js";
import type { Command } from "./types.js";

export const COMMANDS: readonly Command[] = [
  {
    name: "init",
    description: "Initialize workspace (interactive document type setup)",
    handler: initCommand,
  },
  {
    name: "gateway",
    description: "Save Vercel AI Gateway API key to workspace .env",
    handler: gatewayCommand,
  },
  {
    name: "login",
    description: "Sign in to your Backed account (device authorization)",
    handler: loginCommand,
  },
  {
    name: "logout",
    description: "Sign out of your Backed account on this machine",
    handler: logoutCommand,
  },
  {
    name: "model",
    description: "Ingest + profile + semantic → ontology proposal",
    handler: modelCommand,
  },
  {
    name: "review",
    description: "Human review (risk-ranked questions) → model.yaml",
    handler: reviewCommand,
  },
  {
    name: "diff",
    description: "Compare the last two runs",
    handler: diffCommand,
  },
  {
    name: "serve",
    description: "Local MCP server on model.yaml",
    handler: serveCommand,
  },
];

export function printCliHelp(): void {
  printHelp(getUi(), COMMANDS);
}

/** Load `.env` from the Anchor workspace root when present. */
function loadDotEnv(): void {
  loadWorkspaceDotEnv(process.cwd());
}

async function main(): Promise<void> {
  initUi();
  const [, , commandName, ...args] = process.argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
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
