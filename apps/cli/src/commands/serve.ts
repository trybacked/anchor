import { readModelYaml } from "@backed/core";
import { startStdioMcpServer } from "@backed/mcp";

import type { CommandHandler } from "../types.js";

export const serveCommand: CommandHandler = async () => {
  const root = process.cwd();
  const model = readModelYaml(root);

  // stdout is the MCP transport: every human message must go to stderr.
  console.error(
    `Server MCP "backed-model" avviato su stdio — ${String(model.entities.length)} entità, ${String(model.relations.length)} relazioni.`,
  );
  console.error("Tools: list_entities, get_entity, list_relations, search_model. Ctrl+C per uscire.");

  await startStdioMcpServer(model);
};
