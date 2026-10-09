import {
  MAX_TRAVERSE_DEPTH,
  MIN_TRAVERSE_DEPTH,
  SEMANTIC_CHAT_MAX_ROW_LIMIT,
  type Ontology,
  type SemanticModel,
} from "@trybacked/core";
import {
  DEFAULT_CHUNK_SEARCH_LIMIT,
  DEFAULT_CHUNK_SEARCH_MIN_SCORE,
  MAX_CHUNK_SEARCH_LIMIT,
  MAX_PROFILE_FACT_LIMIT,
  MAX_PROFILE_MATCH_LIMIT,
  MAX_TRAVERSE_ROW_LIMIT,
  type OntologyQueryRuntime,
} from "@trybacked/runtime";
import {
  createAnchorService,
  DEFAULT_SCHEMA_SEARCH_HITS,
  defaultRowLimitForProfile,
  getPropertyValues,
  MAX_SCHEMA_SEARCH_HITS,
  maxRowLimitForProfile,
  searchOntologySchema,
  serviceError,
} from "@trybacked/service";
import { z } from "zod";
import { TOOL_NAMES, type McpSurfaceTool } from "./constants.js";
import type { SearchModelOptions } from "./mapping.js";
export type SemanticAskHandler = (body: {
  question: string;
  evidence?: boolean | undefined;
}) => Promise<unknown>;
export interface ToolContext {
  model: SemanticModel;
  ontology?: Ontology | undefined;
  searchModelOptions?: SearchModelOptions;
  queryRuntime?: OntologyQueryRuntime;
  semanticAsk?: SemanticAskHandler | undefined;
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
function serviceFromContext(context: ToolContext) {
  return createAnchorService({
    model: context.model,
    executionProfile: "mcp",
    ...(context.ontology !== undefined ? { ontology: context.ontology } : {}),
    ...(context.searchModelOptions !== undefined
      ? { searchModelOptions: context.searchModelOptions }
      : {}),
    ...(context.queryRuntime !== undefined ? { queryRuntime: context.queryRuntime } : {}),
  });
}
export const MCP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: TOOL_NAMES.listEntities,
    title: "List entities",
    description: "List semantic model entities (id, name, description, status).",
    handler: (context) => serviceFromContext(context).listEntities(),
  },
  {
    name: TOOL_NAMES.getEntity,
    title: "Entity detail",
    description:
      "Return an entity with properties (semanticType, role, provenance) and entity provenance.",
    inputSchema: { id: z.string().min(1).describe("Entity id, e.g. 'customer'") },
    handler: (context, args) => {
      const id = readToolString(args, "id");
      return serviceFromContext(context).getEntity(id);
    },
  },
  {
    name: TOOL_NAMES.listRelations,
    title: "List relations",
    description:
      "List relations between entities with cardinality and status. Optionally filter by entity id.",
    inputSchema: {
      id: z
        .string()
        .min(1)
        .optional()
        .describe("Optional entity id — returns relations touching this entity"),
    },
    handler: (context, args) => {
      const entityId = args["id"];
      return serviceFromContext(context).listRelations(
        typeof entityId === "string" ? entityId : undefined,
      );
    },
  },
  {
    name: TOOL_NAMES.searchModel,
    title: "Search model",
    description:
      "Search entities, properties, relations, and rules. Uses semantic document-chunk vectors when available, with substring fallback.",
    inputSchema: { query: z.string().min(1).describe("Text to search, e.g. 'customer'") },
    handler: (context, args) =>
      serviceFromContext(context).searchModel(readToolString(args, "query")),
  },
  {
    name: TOOL_NAMES.searchSchema,
    title: "Search schema",
    description:
      "Rank ontology objects and properties by relevance (names, synonyms, descriptions, glossary).",
    inputSchema: {
      query: z.string().min(1).describe("Natural language hint, e.g. 'ingest month'"),
      limit: z.number().int().positive().max(MAX_SCHEMA_SEARCH_HITS).optional(),
    },
    handler: (context, args) => {
      if (context.ontology === undefined) {
        return serviceError("unavailable", "Ontology is not loaded for schema search.");
      }
      const query = readToolString(args, "query");
      const limit = typeof args["limit"] === "number" ? args["limit"] : DEFAULT_SCHEMA_SEARCH_HITS;
      return { hits: searchOntologySchema(context.ontology, query, limit) };
    },
  },
  {
    name: TOOL_NAMES.getPropertyValues,
    title: "Property values",
    description: "Top distinct values with counts for an object property (optional prefix).",
    inputSchema: {
      objectId: z.string().min(1),
      propertyId: z.string().min(1),
      prefix: z.string().optional(),
      limit: z.number().int().positive().max(SEMANTIC_CHAT_MAX_ROW_LIMIT).optional(),
    },
    handler: async (context, args) => {
      if (context.ontology === undefined) {
        return serviceError("unavailable", "Ontology is not loaded.");
      }
      const objectId = readToolString(args, "objectId");
      const propertyId = readToolString(args, "propertyId");
      try {
        return await getPropertyValues(serviceFromContext(context), context.ontology, {
          objectId,
          propertyId,
          ...(typeof args["prefix"] === "string" ? { prefix: args["prefix"] } : {}),
          ...(typeof args["limit"] === "number" ? { limit: args["limit"] } : {}),
        });
      } catch (error) {
        return serviceError(
          "bad_request",
          error instanceof Error ? error.message : "Property values query failed.",
        );
      }
    },
  },
  {
    name: TOOL_NAMES.getDefinition,
    title: "Get definition",
    description:
      "Return a confirmed business definition with provenance, or a structured not-found response.",
    inputSchema: {
      term: z.string().min(1).describe("Rule id, name, or phrase, e.g. 'overdue invoice'"),
    },
    handler: (context, args) =>
      serviceFromContext(context).getDefinition(readToolString(args, "term")),
  },
];
export const QUERY_OBJECTS_TOOL_DEFINITION: ToolDefinition = {
  name: TOOL_NAMES.queryObjects,
  title: "Query objects",
  description:
    'Query one published ontology object with filters. mode "count" returns a single total (use for how-many questions). ' +
    `mode "rows" returns table rows (default limit ${String(defaultRowLimitForProfile("mcp"))}, max ${String(maxRowLimitForProfile("mcp"))}). ` +
    "Objects with many properties need low limits, a narrow select, or count mode. " +
    "Use joins + filters.objectId for multi-hop questions. Ops contains/not_contains and textSearch for full-text lite.",
  inputSchema: {
    objectId: z.string().min(1).describe("Object id, e.g. 'customer'"),
    joins: z
      .array(z.object({ relationshipId: z.string().min(1) }))
      .optional()
      .describe("Chain of ontology relationship ids from the root object"),
    select: z
      .array(z.string().min(1))
      .optional()
      .describe(
        'Root property ids or "objectId.propertyId" for joined projection (uses INNER JOIN)',
      ),
    mode: z
      .enum(["rows", "count"])
      .optional()
      .describe("rows (default) or count for COUNT(*) with the same filters"),
    filters: z
      .array(
        z.object({
          objectId: z
            .string()
            .min(1)
            .optional()
            .describe("Filter this object (default root); must appear on the join graph"),
          propertyId: z.string().min(1).describe("Property id (column) of the object"),
          op: z.enum([
            "eq",
            "neq",
            "gt",
            "gte",
            "lt",
            "lte",
            "contains",
            "not_contains",
            "in",
            "not_in",
            "is_null",
            "is_not_null",
            "starts_with",
          ]),
          value: z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.array(z.union([z.string(), z.number(), z.boolean()])),
          ]),
        }),
      )
      .optional()
      .describe("Property filters combined with AND"),
    textSearch: z
      .object({
        query: z.string().min(1),
        objectId: z.string().min(1).optional(),
        propertyIds: z.array(z.string().min(1)).optional(),
      })
      .optional()
      .describe("Case-insensitive OR search across string columns"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        `Row limit for mode rows (default ${String(defaultRowLimitForProfile("mcp"))}, max ${String(maxRowLimitForProfile("mcp"))}); ignored for count`,
      ),
    groupBy: z
      .array(z.string().min(1))
      .optional()
      .describe("Property ids for GROUP BY when using aggregations"),
    aggregations: z
      .array(
        z.object({
          op: z.enum(["sum", "count", "min", "max", "avg"]),
          propertyId: z.string().min(1).optional(),
          alias: z.string().min(1).optional(),
        }),
      )
      .optional()
      .describe("Aggregate metrics (overrides mode rows/count for SELECT shape)"),
    orderBy: z.string().min(1).optional(),
    orderDirection: z.enum(["asc", "desc"]).optional(),
  },
  handler: async (context, args) => {
    const { objectId } = args;
    if (typeof objectId !== "string" || objectId.length === 0) {
      return serviceError("bad_request", "Invalid query: objectId is required");
    }
    return serviceFromContext(context).objectQuery(args);
  },
};
export const WAREHOUSE_READER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: TOOL_NAMES.searchDocuments,
    title: "Search documents",
    description:
      "Hybrid chunk search over the document archive (keyword + optional vectors, merged with RRF). " +
      "Returns text segments with document_id, page range, and relevance score.",
    inputSchema: {
      query: z.string().min(1).describe("Natural language or keyword query"),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_CHUNK_SEARCH_LIMIT)
        .optional()
        .describe(`Max chunks (default ${String(DEFAULT_CHUNK_SEARCH_LIMIT)})`),
      minScore: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(`Minimum relevance (default ${String(DEFAULT_CHUNK_SEARCH_MIN_SCORE)})`),
      documentIds: z
        .array(z.string())
        .optional()
        .describe("Optional filter — only search within these document ids"),
      folder: z
        .array(z.string())
        .max(20)
        .optional()
        .describe("Optional filter — only search within these archive folders (exact match)"),
      elementTypes: z
        .array(z.string())
        .max(20)
        .optional()
        .describe("Optional filter — restrict to these element types (e.g. text, table, header)"),
    },
    handler: async (context, args) =>
      serviceFromContext(context).chunkSearch({
        query: readToolString(args, "query"),
        ...(typeof args["limit"] === "number" ? { limit: args["limit"] } : {}),
        ...(typeof args["minScore"] === "number" ? { minScore: args["minScore"] } : {}),
        ...(Array.isArray(args["documentIds"])
          ? {
              documentIds: args["documentIds"].filter((id): id is string => typeof id === "string"),
            }
          : {}),
        ...(Array.isArray(args["folder"])
          ? {
              folder: args["folder"].filter(
                (folder): folder is string => typeof folder === "string",
              ),
            }
          : {}),
        ...(Array.isArray(args["elementTypes"])
          ? {
              elementTypes: args["elementTypes"].filter(
                (elementType): elementType is string => typeof elementType === "string",
              ),
            }
          : {}),
      }),
  },
  {
    name: TOOL_NAMES.getEntityProfile,
    title: "Entity profile",
    description:
      'Answer "what does X do?" by matching ontology objects, relation counts, and document element citations (optional entity profile facts when present).',
    inputSchema: {
      name: z.string().min(1).describe("Party or organization name (substring match)"),
      matchLimit: z.number().int().positive().max(MAX_PROFILE_MATCH_LIMIT).optional(),
      factLimit: z.number().int().positive().max(MAX_PROFILE_FACT_LIMIT).optional(),
      documentLimit: z.number().int().positive().max(MAX_PROFILE_FACT_LIMIT).optional(),
    },
    handler: async (context, args) =>
      serviceFromContext(context).entityProfile({
        name: readToolString(args, "name"),
        ...(typeof args["matchLimit"] === "number" ? { matchLimit: args["matchLimit"] } : {}),
        ...(typeof args["factLimit"] === "number" ? { factLimit: args["factLimit"] } : {}),
        ...(typeof args["documentLimit"] === "number"
          ? { documentLimit: args["documentLimit"] }
          : {}),
      }),
  },
  {
    name: TOOL_NAMES.traverseGraph,
    title: "Traverse graph",
    description:
      "Follow one or more ontology relations from a starting key (multi-hop join on the warehouse). " +
      `Use list_relations to pick relationId; depth ${String(MIN_TRAVERSE_DEPTH)}–${String(MAX_TRAVERSE_DEPTH)}.`,
    inputSchema: {
      relationId: z.string().min(1).describe("Relation id from list_relations"),
      value: z
        .union([z.string(), z.number()])
        .describe("Starting key on the relation source column"),
      direction: z.enum(["forward", "reverse"]).optional(),
      depth: z.number().int().min(MIN_TRAVERSE_DEPTH).max(MAX_TRAVERSE_DEPTH).optional(),
      limit: z.number().int().positive().max(MAX_TRAVERSE_ROW_LIMIT).describe("Max result rows"),
    },
    handler: async (context, args) => {
      const relationId = readToolString(args, "relationId");
      const value = args["value"];
      const limit = args["limit"];
      if (typeof limit !== "number") {
        return serviceError("bad_request", "Invalid traverse: limit is required");
      }
      if (typeof value !== "string" && typeof value !== "number") {
        return serviceError("bad_request", "Invalid traverse: value is required");
      }
      return serviceFromContext(context).graphTraverse({
        relationId,
        value,
        limit,
        ...(args["direction"] === "forward" || args["direction"] === "reverse"
          ? { direction: args["direction"] }
          : {}),
        ...(typeof args["depth"] === "number" ? { depth: args["depth"] } : {}),
      });
    },
  },
];
export const ASK_SEMANTIC_TOOL_DEFINITION: ToolDefinition = {
  name: TOOL_NAMES.askSemantic,
  title: "Ask semantic",
  description:
    "Natural-language question → routed semantic plan (single warehouse query or document search template). " +
    "Returns rows/count, SQL, provenance, and execution steps. Requires AI Gateway configuration.",
  inputSchema: {
    question: z.string().min(1).describe("Natural language question"),
    evidence: z
      .boolean()
      .optional()
      .describe("When true, attach document chunk evidence to row provenance when available"),
  },
  handler: async (context, args) => {
    if (context.semanticAsk === undefined) {
      return serviceError(
        "unavailable",
        "Semantic chat is not configured (missing ontology, warehouse, or LLM).",
      );
    }
    const result = await context.semanticAsk({
      question: readToolString(args, "question"),
      ...(args["evidence"] === true ? { evidence: true } : {}),
    });
    return result as Record<string, unknown>;
  },
};
export function askSemanticToolForContext(
  semanticAsk: SemanticAskHandler | undefined,
): ToolDefinition[] {
  return semanticAsk === undefined ? [] : [ASK_SEMANTIC_TOOL_DEFINITION];
}
export function warehouseReaderToolsForRuntime(
  queryRuntime: OntologyQueryRuntime | undefined,
): ToolDefinition[] {
  if (queryRuntime === undefined) {
    return [];
  }
  return WAREHOUSE_READER_TOOL_DEFINITIONS.filter((tool) => {
    if (tool.name === TOOL_NAMES.searchDocuments) {
      return queryRuntime.chunkSearch !== undefined;
    }
    if (tool.name === TOOL_NAMES.getEntityProfile) {
      return queryRuntime.entityProfile !== undefined;
    }
    if (tool.name === TOOL_NAMES.traverseGraph) {
      return queryRuntime.graphTraverse !== undefined;
    }
    return false;
  });
}
