import { existsSync } from "node:fs";

import { readModelYaml, workspacePaths } from "@backed/core";
import type { RowReader } from "@backed/core";
import { createRowReader, openDataSession } from "@backed/ingest";
import { startStdioMcpServer } from "@backed/mcp";

import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";

export const serveCommand: CommandHandler = async () => {
  const root = findWorkspaceRoot(process.cwd());
  const paths = workspacePaths(root);
  const model = readModelYaml(root);

  let rowReader: RowReader | undefined;
  let dataSession: { close: () => void } | undefined;

  if (existsSync(paths.dataPath)) {
    const session = await openDataSession(paths.dataPath);
    dataSession = session;
    rowReader = createRowReader(session.query);
    console.error(`Data snapshot loaded: ${paths.dataPath}`);
  } else {
    console.error(
      'No data snapshot found (.backed/data.duckdb). Data tools disabled until you run "backed model".',
    );
  }

  const tools = rowReader
    ? "list_entities, get_entity, list_relations, search_model, query_entity"
    : "list_entities, get_entity, list_relations, search_model";

  console.error(
    `MCP server "backed-model" started on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations.`,
  );
  console.error(`Tools: ${tools}. Ctrl+C to exit.`);

  try {
    await startStdioMcpServer(model, rowReader ? { rowReader } : {});
  } finally {
    dataSession?.close();
  }
};
