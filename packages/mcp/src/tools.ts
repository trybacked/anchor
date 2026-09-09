import type { SemanticModel } from "@backed/core";
import { z } from "zod";
import { TOOL_NAMES, type McpSurfaceTool } from "./constants.js";
import { entityNotFoundMessage } from "./errors.js";
import {
    getDefinition,
    getEntity,
    listEntities,
    listRelations,
    searchModel,
    type SearchModelOptions,
} from "./mapping.js";

export interface ToolContext {
    model: SemanticModel;
    searchModelOptions?: SearchModelOptions;
}

export type ToolResult =
    | Record<string, unknown>
    | unknown[]
    | string
    | number
    | boolean
    | null
    | Promise<Record<string, unknown> | unknown[] | string | number | boolean | null>;

function readToolString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    return typeof value === "string" ? value : "";
}

export interface ToolDefinition {
    name: McpSurfaceTool;
    title: string;
    description: string;
    inputSchema?: Record<string, z.ZodTypeAny>;
    handler: (context: ToolContext, args: Record<string, unknown>) => ToolResult;
}

export const MCP_TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: TOOL_NAMES.listEntities,
        title: "List entities",
        description: "List semantic model entities (id, name, description, status).",
        handler: ({ model }) => listEntities(model),
    },
    {
        name: TOOL_NAMES.getEntity,
        title: "Entity detail",
        description: "Return an entity with properties (semanticType, role, provenance) and entity provenance.",
        inputSchema: { id: z.string().min(1).describe("Entity id, e.g. 'customer'") },
        handler: ({ model }, args) => {
            const id = readToolString(args, "id");
            const detail = getEntity(model, id);
            if (detail === null) {
                return { error: entityNotFoundMessage(id) };
            }
            return detail;
        },
    },
    {
        name: TOOL_NAMES.listRelations,
        title: "List relations",
        description: "List relations between entities with cardinality and status. Optionally filter by entity id.",
        inputSchema: {
            id: z
                .string()
                .min(1)
                .optional()
                .describe("Optional entity id — returns relations touching this entity"),
        },
        handler: ({ model }, args) => {
            const entityId = args["id"];
            return listRelations(model, typeof entityId === "string" ? entityId : undefined);
        },
    },
    {
        name: TOOL_NAMES.searchModel,
        title: "Search model",
        description: "Search entities, properties, relations, and rules. Uses semantic document-chunk vectors when available, with substring fallback.",
        inputSchema: { query: z.string().min(1).describe("Text to search, e.g. 'cliente'") },
        handler: ({ model, searchModelOptions }, args) =>
            searchModel(model, readToolString(args, "query"), searchModelOptions),
    },
    {
        name: TOOL_NAMES.getDefinition,
        title: "Get definition",
        description: "Return a confirmed business definition with provenance, or a structured not-found response.",
        inputSchema: {
            term: z.string().min(1).describe("Rule id, name, or phrase, e.g. 'fattura scaduta'"),
        },
        handler: ({ model }, args) => getDefinition(model, readToolString(args, "term")),
    },
];
