import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { SemanticModel } from "@backed/core";
import { z } from "zod";
import { MCP_SURFACE_TOOLS, SERVER_NAME, SERVER_VERSION, TOOL_NAMES } from "./constants.js";
import { entityNotFoundMessage } from "./errors.js";
import { getDefinition, getEntity, listEntities, listRelations, searchModel, } from "./mapping.js";
export interface ServeUsageRecorder {
    record(operation: McpSurfaceOperation): Promise<void>;
}
export type McpSurfaceOperation = (typeof MCP_SURFACE_TOOLS)[number];
export interface ModelMcpServerOptions {
    usageRecorder?: ServeUsageRecorder;
}
function jsonContent(data: unknown): {
    content: {
        type: "text";
        text: string;
    }[];
} {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function errorContent(text: string): {
    isError: true;
    content: {
        type: "text";
        text: string;
    }[];
} {
    return {
        isError: true,
        content: [{ type: "text", text }],
    };
}
async function withUsage<T>(operation: McpSurfaceOperation, usageRecorder: ServeUsageRecorder | undefined, handler: () => T | Promise<T>): Promise<T> {
    if (usageRecorder !== undefined) {
        await usageRecorder.record(operation);
    }
    return handler();
}
export function createModelMcpServer(model: SemanticModel, options: ModelMcpServerOptions = {}): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    const usageRecorder = options.usageRecorder;
    server.registerTool(TOOL_NAMES.listEntities, {
        title: "List entities",
        description: "List semantic model entities (id, name, description, status).",
    }, async () => withUsage(TOOL_NAMES.listEntities, usageRecorder, () => jsonContent(listEntities(model))));
    server.registerTool(TOOL_NAMES.getEntity, {
        title: "Entity detail",
        description: "Return an entity with properties (semanticType, role, provenance) and entity provenance.",
        inputSchema: { id: z.string().min(1).describe("Entity id, e.g. 'customer'") },
    }, async ({ id }) => withUsage(TOOL_NAMES.getEntity, usageRecorder, () => {
        const detail = getEntity(model, id);
        if (detail === null) {
            return errorContent(entityNotFoundMessage(id));
        }
        return jsonContent(detail);
    }));
    server.registerTool(TOOL_NAMES.listRelations, {
        title: "List relations",
        description: "List relations between entities with cardinality and status. Optionally filter by entity id.",
        inputSchema: {
            entity_id: z
                .string()
                .min(1)
                .optional()
                .describe("Optional entity id — returns relations touching this entity"),
        },
    }, async ({ entity_id: entityId }) => withUsage(TOOL_NAMES.listRelations, usageRecorder, () => jsonContent(listRelations(model, entityId))));
    server.registerTool(TOOL_NAMES.searchModel, {
        title: "Search model",
        description: "Text match on entity names, property names, relations, and business definitions. No vectors.",
        inputSchema: { query: z.string().min(1).describe("Text to search, e.g. 'cliente'") },
    }, async ({ query }) => withUsage(TOOL_NAMES.searchModel, usageRecorder, () => jsonContent(searchModel(model, query))));
    server.registerTool(TOOL_NAMES.getDefinition, {
        title: "Get definition",
        description: "Return a confirmed business definition with provenance, or a structured not-found response.",
        inputSchema: {
            term: z.string().min(1).describe("Rule id, name, or phrase, e.g. 'fattura scaduta'"),
        },
    }, async ({ term }) => withUsage(TOOL_NAMES.getDefinition, usageRecorder, () => jsonContent(getDefinition(model, term))));
    return server;
}
export async function startStdioMcpServer(model: SemanticModel, options: ModelMcpServerOptions = {}): Promise<McpServer> {
    const server = createModelMcpServer(model, options);
    await server.connect(new StdioServerTransport());
    return server;
}
export async function runStdioMcpServerUntilClose(model: SemanticModel, options: ModelMcpServerOptions = {}): Promise<void> {
    const server = createModelMcpServer(model, options);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    await new Promise<void>((resolve) => {
        const previousOnClose = transport.onclose;
        transport.onclose = () => {
            previousOnClose?.();
            resolve();
        };
        const shutdown = (): void => {
            void server.close();
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
    });
}
