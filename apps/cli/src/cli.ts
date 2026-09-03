#!/usr/bin/env node
import {
  diffCommand,
  initCommand,
  modelCommand,
  reviewCommand,
  serveCommand,
} from "./commands/index.js";
import type { Command } from "./types.js";

export const COMMANDS: readonly Command[] = [
  { name: "init", description: "Inizializza workspace .backed/", handler: initCommand },
  { name: "model", description: "Ingest + profile + semantic → proposta ontologia", handler: modelCommand },
  { name: "review", description: "Review umana (max 10 domande per rischio)", handler: reviewCommand },
  { name: "diff", description: "Confronto tra run", handler: diffCommand },
  { name: "serve", description: "MCP server locale", handler: serveCommand },
];

export function printHelp(): void {
  console.log("backed — semantic layer local-first\n");
  console.log("Usage: backed <command> [args]\n");
  console.log("Commands:");
  for (const cmd of COMMANDS) {
    console.log(`  ${cmd.name.padEnd(8)} ${cmd.description}`);
  }
}

async function main(): Promise<void> {
  const [, , commandName, ...args] = process.argv;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  const command = COMMANDS.find((c) => c.name === commandName);
  if (!command) {
    console.error(`Comando sconosciuto: ${commandName}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  await command.handler(args);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
