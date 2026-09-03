/**
 * Local MCP server (stdio transport) exposing the confirmed ontology to AI
 * agents. Pattern adapted from the previous repo's local-server: McpServer +
 * registerTool; here the tools query modello.yaml instead of HTTP bindings.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { SemanticModel } from "@backed/core";
import { z } from "zod";

import { getEntity, listEntities, listRelations, searchModel } from "./mapping.js";

const SERVER_NAME = "backed-model";
const SERVER_VERSION = "0.1.0";

function jsonContent(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function createModelMcpServer(model: SemanticModel): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "list_entities",
    {
      title: "Elenco entità",
      description:
        "Elenca le entità del modello semantico (id, nome, tabella sorgente, stato, confidenza).",
    },
    () => jsonContent(listEntities(model)),
  );

  server.registerTool(
    "get_entity",
    {
      title: "Dettaglio entità",
      description:
        "Restituisce un'entità con le sue property (colonne, tipi semantici), le relazioni e le regole che la riguardano.",
      inputSchema: { id: z.string().min(1).describe("Id dell'entità, es. 'cliente'") },
    },
    ({ id }) => {
      const detail = getEntity(model, id);
      if (!detail) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Entità "${id}" non trovata. Usa list_entities per gli id disponibili.`,
            },
          ],
        };
      }
      return jsonContent(detail);
    },
  );

  server.registerTool(
    "list_relations",
    {
      title: "Elenco relazioni",
      description:
        "Elenca le relazioni tra entità con colonne di aggancio, cardinalità e confidenza.",
    },
    () => jsonContent(listRelations(model)),
  );

  server.registerTool(
    "search_model",
    {
      title: "Ricerca nel modello",
      description:
        "Cerca per testo tra entità, property, relazioni e definizioni di business del modello.",
      inputSchema: { query: z.string().min(1).describe("Testo da cercare, es. 'partita iva'") },
    },
    ({ query }) => jsonContent(searchModel(model, query)),
  );

  return server;
}

export async function startStdioMcpServer(model: SemanticModel): Promise<McpServer> {
  const server = createModelMcpServer(model);
  await server.connect(new StdioServerTransport());
  return server;
}
