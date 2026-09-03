import { readModelYaml } from "@backed/core";
import { startStdioMcpServer } from "@backed/mcp";

import type { CommandHandler } from "../types.js";

export const serveCommand: CommandHandler = async () => {
  const root = process.cwd();
  const model = readModelYaml(root);

  // stdout is the MCP transport: every human message must go to stderr.
  console.error(
    `MCP server "backed-model" started on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations.`,
  );
  console.error("Tools: list_entities, get_entity, list_relations, search_model. Ctrl+C to exit.");

  await startStdioMcpServer(model);
};
