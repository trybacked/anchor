#!/usr/bin/env node
import {
  diffCommand,
  initCommand,
  modelCommand,
  reviewCommand,
  serveCommand,
} from "./commands/index.js";
import { loadWorkspaceDotEnv } from "./env.js";
import type { Command } from "./types.js";

export const COMMANDS: readonly Command[] = [
  { name: "init", description: "Initialize .backed/ workspace", handler: initCommand },
  { name: "model", description: "Ingest + profile + semantic → ontology proposal", handler: modelCommand },
  { name: "review", description: "Human review (risk-ranked questions) → model.yaml", handler: reviewCommand },
  { name: "diff", description: "Compare the last two runs", handler: diffCommand },
  { name: "serve", description: "Local MCP server on model.yaml", handler: serveCommand },
];

export function printHelp(): void {
  console.log("backed — local-first semantic layer\n");
  console.log("Usage: backed <command> [args]\n");
  console.log("Commands:");
  for (const cmd of COMMANDS) {
    console.log(`  ${cmd.name.padEnd(8)} ${cmd.description}`);
  }
}

/** Load `.env` from the Anchor workspace root when present. */
function loadDotEnv(): void {
  loadWorkspaceDotEnv(process.cwd());
}

async function main(): Promise<void> {
  const [, , commandName, ...args] = process.argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  const command = COMMANDS.find((c) => c.name === commandName);
  if (!command) {
    console.error(`Unknown command: ${commandName}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  loadDotEnv();
  await command.handler(args);
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
