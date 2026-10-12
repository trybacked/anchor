import {
  deployCommand,
  diffCommand,
  doctorCommand,
  evalCommand,
  exportCommand,
  extractCommand,
  ingestCommand,
  initCommand,
  migrateCommand,
  reviewCommand,
  rollbackCommand,
  runCommand,
  statusCommand,
  syncCommand,
} from "./commands/index.js";
import { COMMANDS as CLI_COMMAND_NAMES } from "./config.js";
import type { Command } from "./types.js";
export const ANCHOR_COMMANDS: readonly Command[] = [
  {
    name: CLI_COMMAND_NAMES.INIT,
    description: "Initialize a workspace (.backed/config.yaml)",
    handler: initCommand,
  },
  {
    name: CLI_COMMAND_NAMES.SYNC,
    description: "Snapshot model.yaml into the versioned local registry",
    handler: syncCommand,
  },
  {
    name: CLI_COMMAND_NAMES.DEPLOY,
    description: "MCP on stdio for agents (uses registry for query_objects)",
    handler: deployCommand,
  },
  {
    name: CLI_COMMAND_NAMES.MIGRATE,
    description: "Upgrade model.yaml from semantic v1 to OntologySpec v2",
    handler: migrateCommand,
  },
  {
    name: CLI_COMMAND_NAMES.INGEST,
    description: "Index and parse documents under BACKED_FILES_ROOT",
    handler: ingestCommand,
  },
  {
    name: CLI_COMMAND_NAMES.REVIEW,
    description: "Review and apply ontology change sets",
    handler: reviewCommand,
  },
  {
    name: CLI_COMMAND_NAMES.EXTRACT,
    description: "Extract instances, resolve entities, materialize warehouse",
    handler: extractCommand,
  },
  {
    name: CLI_COMMAND_NAMES.EVAL,
    description: "Evaluate ontology against competency questions",
    handler: evalCommand,
  },
  {
    name: CLI_COMMAND_NAMES.RUN,
    description: "AI pipeline: ingest → induce → extract → eval → sync",
    handler: runCommand,
  },
  {
    name: CLI_COMMAND_NAMES.DOCTOR,
    description: "Check dependencies, env, and connectivity",
    handler: doctorCommand,
  },
  {
    name: CLI_COMMAND_NAMES.STATUS,
    description: "Workspace pipeline and registry status",
    handler: statusCommand,
  },
  {
    name: CLI_COMMAND_NAMES.ROLLBACK,
    description: "Restore a previous synced ontology version",
    handler: rollbackCommand,
  },
  {
    name: CLI_COMMAND_NAMES.DIFF,
    description: "Diff two publication versions or model drafts",
    handler: diffCommand,
  },
  {
    name: CLI_COMMAND_NAMES.EXPORT,
    description: "Export ontology to RDF/Turtle (interop)",
    handler: exportCommand,
  },
];
export const ANCHOR_COMMAND_NAMES = new Set(ANCHOR_COMMANDS.map((command) => command.name));
const LEGACY_ANCHOR_COMMAND_ALIASES: Record<string, string> = {
  discover: CLI_COMMAND_NAMES.RUN,
  serve: CLI_COMMAND_NAMES.DEPLOY,
  publish: CLI_COMMAND_NAMES.SYNC,
  register: CLI_COMMAND_NAMES.SYNC,
};
export async function dispatchAnchorCommand(commandName: string, args: string[]): Promise<void> {
  const resolvedName = LEGACY_ANCHOR_COMMAND_ALIASES[commandName] ?? commandName;
  const command = ANCHOR_COMMANDS.find((entry) => entry.name === resolvedName);
  if (!command) {
    throw new UnknownAnchorCommandError(commandName);
  }
  await command.handler(args);
}
export class UnknownAnchorCommandError extends Error {
  constructor(commandName: string) {
    super(`Unknown anchor command: ${commandName}`);
    this.name = "UnknownAnchorCommandError";
  }
}
