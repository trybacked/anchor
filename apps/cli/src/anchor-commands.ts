import { deployCommand, initCommand, pullCommand, syncCommand } from "./commands/index.js";
import { COMMANDS as CLI_COMMAND_NAMES } from "./config.js";
import type { Command } from "./types.js";

export const ANCHOR_COMMANDS: readonly Command[] = [
  {
    name: CLI_COMMAND_NAMES.INIT,
    description: "Initialize a workspace (.backed/config.yaml)",
    handler: initCommand,
  },
  {
    name: CLI_COMMAND_NAMES.PULL,
    description: "Pull warehouse schema → model.yaml (deterministic)",
    handler: pullCommand,
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
];

export const ANCHOR_COMMAND_NAMES = new Set(ANCHOR_COMMANDS.map((command) => command.name));

const LEGACY_ANCHOR_COMMAND_ALIASES: Record<string, string> = {
  discover: CLI_COMMAND_NAMES.PULL,
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
