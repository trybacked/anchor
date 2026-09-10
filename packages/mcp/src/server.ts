import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { SemanticModel } from "@backed/core";
import type { McpSurfaceTool } from "./constants.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import type { SearchModelOptions } from "./mapping.js";
import { MCP_TOOL_DEFINITIONS, type ToolContext } from "./tools.js";

export interface ServeUsageRecorder {
    record(operation: McpSurfaceTool): Promise<void>;
}

export type McpSurfaceOperation = McpSurfaceTool;

export interface ModelMcpServerOptions {
    usageRecorder?: ServeUsageRecorder;
    searchModelOptions?: SearchModelOptions;
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

function isToolErrorResult(result: unknown): result is { error: string } {
    return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string";
}

async function withUsage<T>(
    operation: McpSurfaceTool,
    usageRecorder: ServeUsageRecorder | undefined,
    handler: () => T | Promise<T>,
): Promise<T> {
    if (usageRecorder !== undefined) {
        void usageRecorder.record(operation).catch(() => {
            // Metering must not block or fail local MCP tools.
        });
    }
    return handler();
}

export function createModelMcpServer(model: SemanticModel, options: ModelMcpServerOptions = {}): McpServer {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    const usageRecorder = options.usageRecorder;
    const toolContext: ToolContext = {
        model,
        ...(options.searchModelOptions !== undefined ? { searchModelOptions: options.searchModelOptions } : {}),
    };

    for (const tool of MCP_TOOL_DEFINITIONS) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
            },
            async (args) =>
                withUsage(tool.name, usageRecorder, async () => {
                    const result = await tool.handler(toolContext, args);
                    if (isToolErrorResult(result)) {
                        return errorContent(result.error);
                    }
                    return jsonContent(result);
                }),
        );
    }

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
