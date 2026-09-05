import { existsSync } from "node:fs";

import { readModelYaml, workspacePaths } from "@backed/core";
import type { ChunkSearcher, RowReader } from "@backed/core";
import { createChunkSearcher, createRowReader, openDataSession } from "@backed/ingest";
import { startStdioMcpServer } from "@backed/mcp";
import { embedQuery, resolveSemanticModels } from "@backed/semantic";

import { findWorkspaceRoot } from "../env.js";
import type { CommandHandler } from "../types.js";

export const serveCommand: CommandHandler = async () => {
  const root = findWorkspaceRoot(process.cwd());
  const paths = workspacePaths(root);
  const model = readModelYaml(root);

  let rowReader: RowReader | undefined;
  let chunkSearcher: ChunkSearcher | undefined;
  let dataSession: { close: () => void } | undefined;

  if (existsSync(paths.dataPath)) {
    const session = await openDataSession(paths.dataPath);
    dataSession = session;
    rowReader = createRowReader(session.query);

    let embedQueryFn: ((text: string) => Promise<number[]>) | undefined;
    try {
      const models = resolveSemanticModels();
      embedQueryFn = (text: string) => embedQuery(models.embedding, text);
    } catch {
      embedQueryFn = undefined;
    }

    chunkSearcher = createChunkSearcher(session.query, {
      ...(embedQueryFn !== undefined ? { embedQuery: embedQueryFn } : {}),
    });
    console.error(`Data snapshot loaded: ${paths.dataPath}`);
  } else {
    console.error(
      'No data snapshot found (.backed/data.duckdb). Data tools disabled until you run "backed model".',
    );
  }

  const tools = [
    "list_entities",
    "get_entity",
    "list_relations",
    "search_model",
    ...(rowReader ? ["query_entity", "traverse_relation"] : []),
  ];

  console.error(
    `MCP server "backed-model" started on stdio — ${String(model.entities.length)} entities, ${String(model.relations.length)} relations.`,
  );
  console.error(`Tools: ${tools.join(", ")}. Ctrl+C to exit.`);

  const serverOptions: { rowReader?: RowReader; chunkSearcher?: ChunkSearcher } = {};
  if (rowReader) {
    serverOptions.rowReader = rowReader;
  }
  if (chunkSearcher) {
    serverOptions.chunkSearcher = chunkSearcher;
  }

  try {
    await startStdioMcpServer(model, serverOptions);
  } finally {
    dataSession?.close();
  }
};
