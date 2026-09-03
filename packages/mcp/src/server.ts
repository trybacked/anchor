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
      title: "List entities",
      description:
        "List semantic model entities (id, name, source table, status, confidence).",
    },
    () => jsonContent(listEntities(model)),
  );

  server.registerTool(
    "get_entity",
    {
      title: "Entity detail",
      description:
        "Return an entity with its properties (columns, semantic types), relations, and rules that apply to it.",
      inputSchema: { id: z.string().min(1).describe("Entity id, e.g. 'customer'") },
    },
    ({ id }) => {
      const detail = getEntity(model, id);
      if (!detail) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Entity "${id}" not found. Use list_entities for available ids.`,
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
      title: "List relations",
      description:
        "List relations between entities with anchor columns, cardinality, and confidence.",
    },
    () => jsonContent(listRelations(model)),
  );

  server.registerTool(
    "search_model",
    {
      title: "Search model",
      description:
        "Search by text across entities, properties, relations, and business definitions in the model.",
      inputSchema: { query: z.string().min(1).describe("Text to search, e.g. 'vat number'") },
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
