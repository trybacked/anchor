/**
 * Local MCP server (stdio transport) exposing the confirmed ontology to AI
 * agents. Pattern adapted from the previous repo's local-server: McpServer +
 * registerTool; here the tools query model.yaml instead of HTTP bindings.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ChunkSearcher, RowReader, SemanticModel } from "@backed/core";
import { MAX_ROW_LIMIT } from "@backed/core";
import { z } from "zod";

import { queryEntityErrorMessage, queryEntityRows } from "./data.js";
import { getEntity, listEntities, listRelations, searchModel } from "./mapping.js";

const SERVER_NAME = "backed-model";
const SERVER_VERSION = "0.1.0";

const rowFilterSchema = z.object({
  column: z.string().min(1).describe("Source column name from the entity properties"),
  op: z.enum(["=", "!=", ">", ">=", "<", "<="]).describe("Comparison operator"),
  value: z.union([z.string(), z.number()]).describe("Value to compare against"),
});

export interface ModelMcpServerOptions {
  rowReader?: RowReader | undefined;
  chunkSearcher?: ChunkSearcher | undefined;
}

function jsonContent(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function createModelMcpServer(
  model: SemanticModel,
  options: ModelMcpServerOptions = {},
): McpServer {
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

  if (options.rowReader) {
    const rowReader = options.rowReader;
    const chunkSearcher = options.chunkSearcher;
    server.registerTool(
      "query_entity",
      {
        title: "Query entity",
        description:
          "Fetch rows for an entity. Use filters for structured columns (from get_entity). Use text for free-text search — document types and document_chunk search PDF body (keyword/semantic hybrid); other entities search text columns. Read-only; no raw SQL.",
        inputSchema: {
          id: z.string().min(1).describe("Entity id, e.g. 'invoice' or 'determination'"),
          filters: z
            .array(rowFilterSchema)
            .optional()
            .describe("Structured column filters (AND-combined)"),
          text: z
            .string()
            .min(1)
            .optional()
            .describe("Free-text search within this entity's data"),
          textMode: z
            .enum(["keyword", "semantic", "hybrid"])
            .optional()
            .describe("Document text search mode. Default: hybrid when embeddings exist"),
          documentId: z
            .string()
            .min(1)
            .optional()
            .describe("Limit document search to one ingested file id"),
          orderBy: z
            .string()
            .min(1)
            .optional()
            .describe("Source column name to sort by"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(MAX_ROW_LIMIT)
            .optional()
            .describe(`Max rows to return (default 25, max ${String(MAX_ROW_LIMIT)})`),
        },
      },
      async (input) => {
        const dependencies = chunkSearcher !== undefined ? { chunkSearcher } : {};
        const result = await queryEntityRows(model, rowReader, input, dependencies);
        if (!result.ok) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: queryEntityErrorMessage(result.error) }],
          };
        }
        return jsonContent(result.rows);
      },
    );
  }

  return server;
}

export async function startStdioMcpServer(
  model: SemanticModel,
  options: ModelMcpServerOptions = {},
): Promise<McpServer> {
  const server = createModelMcpServer(model, options);
  await server.connect(new StdioServerTransport());
  return server;
}
