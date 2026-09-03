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
  { name: "model", description: "Ingest + profile + semantic → proposta ontologia (--no-llm per fermarsi al profilo)", handler: modelCommand },
  { name: "review", description: "Review umana (max 10 domande per rischio) → modello.yaml", handler: reviewCommand },
  { name: "diff", description: "Confronto tra le ultime due run", handler: diffCommand },
  { name: "serve", description: "MCP server locale su modello.yaml", handler: serveCommand },
];

export function printHelp(): void {
  console.log("backed — semantic layer local-first\n");
  console.log("Usage: backed <command> [args]\n");
  console.log("Commands:");
  for (const cmd of COMMANDS) {
    console.log(`  ${cmd.name.padEnd(8)} ${cmd.description}`);
  }
}

/** .env support: local-first, never committed. Missing file is fine. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env in cwd — environment variables may still be set by the shell.
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

  loadDotEnv();
  await command.handler(args);
}

main().catch((error: unknown) => {
  console.error(`Errore: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
