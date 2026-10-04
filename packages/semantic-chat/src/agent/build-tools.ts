import { tool, type ToolSet } from "ai";
import type { Ontology } from "@trybacked/core";
import {
  createReadOnlyToolHandlers,
  GetPropertyValuesInputSchema,
  isServiceErrorResult,
  SearchSchemaInputSchema,
  type AnchorService,
} from "@trybacked/service";
import { z } from "zod";
import { SemanticAgentError } from "./types.js";
import type { AgentBudget } from "./types.js";

export type AgentToolRecorder = (
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
  result: unknown,
  durationMs: number,
) => void;

export type BuildAgentToolsOptions = {
  ontology: Ontology;
  service: AnchorService;
  budget: AgentBudget;
  sqlCalls: { count: number };
  recordStep: AgentToolRecorder;
  onTerminalAnswer: (input: {
    answer: string;
    claims: { text: string; toolCallId: string }[];
    assumptions: string[];
    followUps: string[];
    toolCallId: string;
  }) => void;
  onClarification: (input: {
    question: string;
    options: string[];
    toolCallId: string;
  }) => void;
};

const SubmitAnswerSchema = z.object({
  answer: z.string().min(1),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        toolCallId: z.string().min(1),
      }),
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
});

const ClarificationSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
});

export function buildAgentTools(options: BuildAgentToolsOptions): ToolSet {
  const readOnly = createReadOnlyToolHandlers(options.service, options.ontology);
  const caps = options.service.capabilities();

  const tools = {
    search_schema: tool({
      description: "Find ontology objects and properties relevant to the question.",
      inputSchema: SearchSchemaInputSchema,
      execute: async (input, { toolCallId }) => {
        const stepStarted = Date.now();
        const result = readOnly.search_schema(input);
        options.recordStep(toolCallId, "search_schema", input, result, Date.now() - stepStarted);
        return result;
      },
    }),
    get_entity: tool({
      description: "Load one ontology object with property ids, types, and semantics.",
      inputSchema: z.object({ objectId: z.string().min(1) }),
      execute: async (input, { toolCallId }) => {
        const stepStarted = Date.now();
        try {
          const result = readOnly.get_entity(input);
          options.recordStep(toolCallId, "get_entity", input, result, Date.now() - stepStarted);
          return result;
        } catch (error) {
          throw new SemanticAgentError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    get_property_values: tool({
      description: "Top distinct values with counts for a property (optional prefix filter).",
      inputSchema: GetPropertyValuesInputSchema,
      execute: async (input, { toolCallId }) => {
        if (options.sqlCalls.count >= options.budget.maxSqlCalls) {
          throw new SemanticAgentError("SQL call budget exceeded.");
        }
        options.sqlCalls.count += 1;
        const stepStarted = Date.now();
        try {
          const result = await readOnly.get_property_values(input);
          options.recordStep(
            toolCallId,
            "get_property_values",
            input,
            result,
            Date.now() - stepStarted,
          );
          return result;
        } catch (error) {
          throw new SemanticAgentError(error instanceof Error ? error.message : String(error));
        }
      },
    }),
    query_objects: tool({
      description: "Run a governed ObjectQuery (filters, orderBy, count or rows).",
      inputSchema: z.object({
        objectId: z.string().min(1),
        mode: z.enum(["rows", "count"]).optional(),
        filters: z
          .array(
            z.object({
              objectId: z.string().optional(),
              propertyId: z.string().min(1),
              op: z.string().min(1),
              value: z.union([
                z.string(),
                z.number(),
                z.boolean(),
                z.null(),
                z.array(z.union([z.string(), z.number(), z.boolean()])),
              ]),
            }),
          )
          .optional(),
        select: z.array(z.string()).optional(),
        limit: z.number().int().positive().max(50).optional(),
        orderBy: z.string().optional(),
        orderDirection: z.enum(["asc", "desc"]).optional(),
        joins: z.array(z.object({ relationshipId: z.string() })).optional(),
        groupBy: z.array(z.string()).optional(),
        aggregations: z
          .array(
            z.object({
              op: z.enum(["count", "sum", "avg", "min", "max"]),
              propertyId: z.string().optional(),
              alias: z.string().optional(),
            }),
          )
          .optional(),
      }),
      execute: async (input, { toolCallId }) => {
        if (options.sqlCalls.count >= options.budget.maxSqlCalls) {
          throw new SemanticAgentError("SQL call budget exceeded.");
        }
        options.sqlCalls.count += 1;
        const stepStarted = Date.now();
        const result = await options.service.objectQuery(input);
        if (isServiceErrorResult(result)) {
          throw new SemanticAgentError(result.error.message);
        }
        options.recordStep(
          toolCallId,
          "query_objects",
          input as Record<string, unknown>,
          result,
          Date.now() - stepStarted,
        );
        return result;
      },
    }),
    submit_answer: tool({
      description: "Submit the final grounded answer to the user.",
      inputSchema: SubmitAnswerSchema,
      execute: async (input, { toolCallId }) => {
        options.onTerminalAnswer({ ...input, toolCallId });
        options.recordStep(toolCallId, "submit_answer", input, { ok: true }, 0);
        return { ok: true };
      },
    }),
    ask_clarification: tool({
      description: "Ask the user to disambiguate before running a broad query.",
      inputSchema: ClarificationSchema,
      execute: async (input, { toolCallId }) => {
        options.onClarification({ ...input, toolCallId });
        options.recordStep(toolCallId, "ask_clarification", input, input, 0);
        return { ok: true };
      },
    }),
  };

  const optionalTools = {} as ToolSet;

  if (caps.chunkSearch) {
    optionalTools.search_documents = tool({
      description: "Search document archive chunks by natural language query.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(30).optional(),
      }),
      execute: async (input, { toolCallId }) => {
        const stepStarted = Date.now();
        const result = await options.service.chunkSearch(input);
        if (isServiceErrorResult(result)) {
          throw new SemanticAgentError(result.error.message);
        }
        options.recordStep(toolCallId, "search_documents", input, result, Date.now() - stepStarted);
        return result;
      },
    });
  }

  if (caps.entityProfile) {
    optionalTools.get_entity_profile = tool({
      description: "Load a structured profile for a party or organization name in the docs graph.",
      inputSchema: z.object({
        name: z.string().min(1),
        matchLimit: z.number().int().positive().max(10).optional(),
      }),
      execute: async (input, { toolCallId }) => {
        const stepStarted = Date.now();
        const result = await options.service.entityProfile(input);
        if (isServiceErrorResult(result)) {
          throw new SemanticAgentError(result.error.message);
        }
        options.recordStep(
          toolCallId,
          "get_entity_profile",
          input,
          result,
          Date.now() - stepStarted,
        );
        return result;
      },
    });
  }

  if (caps.graphTraverse) {
    optionalTools.traverse_graph = tool({
      description: "Traverse the knowledge graph along a relation from a seed value.",
      inputSchema: z.object({
        relationId: z.string().min(1),
        value: z.union([z.string(), z.number()]),
        limit: z.number().int().positive().max(30).optional(),
        direction: z.enum(["forward", "reverse"]).optional(),
        mode: z.enum(["rows", "count"]).optional(),
      }),
      execute: async (input, { toolCallId }) => {
        const stepStarted = Date.now();
        const result = await options.service.graphTraverse({
          relationId: input.relationId,
          value: input.value,
          limit: input.limit ?? 15,
          ...(input.direction !== undefined ? { direction: input.direction } : {}),
          ...(input.mode !== undefined ? { mode: input.mode } : {}),
        });
        if (isServiceErrorResult(result)) {
          throw new SemanticAgentError(result.error.message);
        }
        options.recordStep(toolCallId, "traverse_graph", input, result, Date.now() - stepStarted);
        return result;
      },
    });
  }

  return { ...tools, ...optionalTools };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
