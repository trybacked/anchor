#!/usr/bin/env node
import {
  diffCommand,
  discoverCommand,
  initCommand,
  inspectCommand,
  publishCommand,
  reviewCommand,
  rollbackCommand,
  serveCommand,
  validateCommand,
} from "./commands/index.js";
import { COMMANDS as CLI_COMMAND_NAMES, isHelpFlag } from "./config.js";
import { loadWorkspaceDotEnv } from "./env.js";
import type { Command } from "./types.js";
import { getUi, initUi, printHelp } from "./ui/index.js";
export const COMMANDS: readonly Command[] = [
  {
    name: CLI_COMMAND_NAMES.INIT,
    description: "Initialize an Anchor workspace (.backed/config.yaml)",
    handler: initCommand,
  },
  {
    name: CLI_COMMAND_NAMES.INSPECT,
    description: "List datasets and columns from the Databricks SQL warehouse",
    handler: inspectCommand,
  },
  {
    name: CLI_COMMAND_NAMES.DISCOVER,
    description: "Profile Databricks datasets → proposed ontology (no LLM)",
    handler: discoverCommand,
  },
  {
    name: CLI_COMMAND_NAMES.REVIEW,
    description: "Human review (risk-ranked questions) → model.yaml",
    handler: reviewCommand,
  },
  {
    name: CLI_COMMAND_NAMES.PUBLISH,
    description: "Publish reviewed ontology (registry + publication.json)",
    handler: publishCommand,
  },
  {
    name: CLI_COMMAND_NAMES.ROLLBACK,
    description: "Restore a previous published ontology version",
    handler: rollbackCommand,
  },
  {
    name: CLI_COMMAND_NAMES.DIFF,
    description: "Compare the last two runs or published versions",
    handler: diffCommand,
  },
  {
    name: CLI_COMMAND_NAMES.VALIDATE,
    description: "Structural validation of model.yaml (schema + references)",
    handler: validateCommand,
  },
  {
    name: CLI_COMMAND_NAMES.SERVE,
    description: "MCP server on the published ontology (deterministic tools)",
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
