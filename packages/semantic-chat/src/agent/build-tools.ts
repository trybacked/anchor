import { ObjectQuerySchema } from "@trybacked/compiler";
import { DEFAULT_WAREHOUSE_ROW_LIMIT, type Ontology } from "@trybacked/core";
import {
  MAX_CHUNK_SEARCH_LIMIT,
  MAX_PROFILE_MATCH_LIMIT,
  MAX_TRAVERSE_ROW_LIMIT,
} from "@trybacked/runtime";
import {
  createReadOnlyToolHandlers,
  GetPropertyValuesInputSchema,
  isServiceErrorResult,
  SearchSchemaInputSchema,
  type AnchorService,
} from "@trybacked/service";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { validateAgentObjectQuery } from "../query-intent.js";
import {
  SemanticPlanValidationError,
  validateObjectQueryAgainstOntology,
} from "../validate-plan.js";
import { toAgentObjectView } from "./agent-ontology-view.js";
import { evaluateClarification } from "./clarification-policy.js";
import { ontologyHasDocumentArchiveEntity } from "./ontology-capabilities.js";
import { SemanticAgentError, type AgentBudget, type AgentTerminal } from "./types.js";
export type AgentToolEvent = {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  durationMs: number;
} & (
  | {
      status: "ok";
      result: unknown;
    }
  | {
      status: "error";
      error: string;
    }
);
export type AgentToolRecorder = (event: AgentToolEvent) => void;
export type AgentToolkit = {
  tools: ToolSet;
  availableToolNames: () => string[];
};
export type BuildAgentToolsOptions = {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  budget: AgentBudget;
  recordStep: AgentToolRecorder;
  onTerminal: (terminal: AgentTerminal) => void;
};
const SubmitAnswerSchema = z.object({
  answer: z
    .string()
    .min(1)
    .describe(
      "Final text shown to the user: professional, non-technical prose in the user's language; Markdown bullets ok; no property ids or tool names.",
    ),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        toolCallId: z
          .string()
          .min(1)
          .describe("Exact toolCallId from the tool invocation (not the tool name)."),
      }),
    )
    .default([]),
  assumptions: z.array(z.string()).default([]),
  followUps: z.array(z.string()).default([]),
});
const ClarificationSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  ambiguity: z
    .object({
      objectId: z.string().min(1),
      propertyIds: z.array(z.string().min(1)).min(2),
    })
    .optional()
    .describe(
      "Required when unsure between properties (e.g. which date field): the candidate property ids.",
    ),
});
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function unwrapServiceResult<T>(result: T): Exclude<
  T,
  {
    error: unknown;
  }
> {
  if (isServiceErrorResult(result)) {
    throw new Error(result.error.message);
  }
  return result as Exclude<
    T,
    {
      error: unknown;
    }
  >;
}
export function buildAgentTools(options: BuildAgentToolsOptions): AgentToolkit {
  const readOnly = createReadOnlyToolHandlers(options.service, options.ontology);
  const caps = options.service.capabilities();
  const sqlCalls = { count: 0 };
  const sqlToolNames = new Set<string>();
  const ObjectQueryInputSchema = ObjectQuerySchema.extend({
    limit: z.number().int().positive().max(options.budget.maxQueryRows).optional(),
  });
  function defineTool<S extends z.ZodTypeAny>(
    toolName: string,
    description: string,
    inputSchema: S,
    run: (input: z.infer<S>) => unknown,
  ) {
    return tool({
      description,
      inputSchema,
      execute: async (input: z.infer<S>, { toolCallId }) => {
        const started = Date.now();
        const base = { toolCallId, toolName, input: input as Record<string, unknown> };
        try {
          const result = await run(input);
          options.recordStep({ ...base, durationMs: Date.now() - started, status: "ok", result });
          return result;
        } catch (error) {
          const message = errorMessage(error);
          options.recordStep({
            ...base,
            durationMs: Date.now() - started,
            status: "error",
            error: message,
          });
          if (error instanceof SemanticPlanValidationError) {
            throw error;
          }
          throw new SemanticAgentError(message);
        }
      },
    });
  }
  function defineSqlTool<S extends z.ZodTypeAny>(
    toolName: string,
    description: string,
    inputSchema: S,
    run: (input: z.infer<S>) => Promise<unknown>,
  ) {
    sqlToolNames.add(toolName);
    return defineTool(toolName, description, inputSchema, async (input: z.infer<S>) => {
      if (sqlCalls.count >= options.budget.maxSqlCalls) {
        throw new Error(
          `Warehouse budget of ${String(options.budget.maxSqlCalls)} calls exhausted; answer with the results you already have.`,
        );
      }
      const result = await run(input);
      sqlCalls.count += 1;
      return result;
    });
  }
  const tools: ToolSet = {};
  const compactOntology = options.ontology.objects.length <= 4;
  if (!compactOntology) {
    tools.search_schema = defineTool(
      "search_schema",
      "Find ontology objects and properties relevant to the question.",
      SearchSchemaInputSchema,
      (input) => readOnly.search_schema(input),
    );
  }
  if (!compactOntology) {
    tools.get_entity = defineTool(
      "get_entity",
      "Load one object's properties (id, type, role, semantics) and relationships. Skip it when the system prompt already lists what you need.",
      z.object({ objectId: z.string().min(1) }),
      (input) => toAgentObjectView(options.ontology, readOnly.get_entity(input).object),
    );
  }
  if (!compactOntology) {
    tools.get_property_values = defineSqlTool(
      "get_property_values",
      "Top distinct values with counts for a property (optional prefix filter). Use to check value spelling or format.",
      GetPropertyValuesInputSchema,
      (input) => readOnly.get_property_values(input),
    );
  }
  tools.query_objects = defineSqlTool(
    "query_objects",
    "Run a governed ObjectQuery (filters, textSearch, joins, groupBy/aggregations, orderBy, count or rows).",
    ObjectQueryInputSchema,
    async (input) => {
      const validated = validateObjectQueryAgainstOntology(options.ontology, input);
      const intentChecked = validateAgentObjectQuery(options.ontology, options.question, validated);
      return unwrapServiceResult(await options.service.objectQuery(intentChecked));
    },
  );
  tools.submit_answer = defineTool(
    "submit_answer",
    "Submit the final user-visible answer (plain language, good formatting). Every number must have a claim with the toolCallId that returned it; put technical notes in assumptions, not in answer.",
    SubmitAnswerSchema,
    (input) => {
      options.onTerminal({ kind: "answer", ...input });
      return { ok: true };
    },
  );
  tools.ask_clarification = defineTool(
    "ask_clarification",
    "Ask the user to choose between materially different interpretations that the ontology cannot resolve.",
    ClarificationSchema,
    (input) => {
      const verdict = evaluateClarification(options.ontology, options.question, input.ambiguity);
      if (!verdict.accepted) {
        throw new Error(`Clarification rejected: ${verdict.reason}`);
      }
      options.onTerminal({
        kind: "clarification",
        question: input.question,
        options: input.options,
      });
      return { ok: true };
    },
  );
  const exposeDocumentArchive =
    caps.chunkSearch && ontologyHasDocumentArchiveEntity(options.ontology);
  if (exposeDocumentArchive) {
    tools.search_documents = defineSqlTool(
      "search_documents",
      "Search document archive chunks by natural language query.",
      z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(MAX_CHUNK_SEARCH_LIMIT).optional(),
      }),
      async (input) => unwrapServiceResult(await options.service.chunkSearch(input)),
    );
  }
  if (caps.entityProfile && exposeDocumentArchive) {
    tools.get_entity_profile = defineSqlTool(
      "get_entity_profile",
      "Load a structured profile for a party or organization name in the docs graph.",
      z.object({
        name: z.string().min(1),
        matchLimit: z.number().int().positive().max(MAX_PROFILE_MATCH_LIMIT).optional(),
      }),
      async (input) => unwrapServiceResult(await options.service.entityProfile(input)),
    );
  }
  if (caps.graphTraverse && exposeDocumentArchive) {
    tools.traverse_graph = defineSqlTool(
      "traverse_graph",
      "Traverse the knowledge graph along a relation from a seed value.",
      z.object({
        relationId: z.string().min(1),
        value: z.union([z.string(), z.number()]),
        limit: z.number().int().positive().max(MAX_TRAVERSE_ROW_LIMIT).optional(),
        direction: z.enum(["forward", "reverse"]).optional(),
        mode: z.enum(["rows", "count"]).optional(),
      }),
      async (input) =>
        unwrapServiceResult(
          await options.service.graphTraverse({
            relationId: input.relationId,
            value: input.value,
            limit: input.limit ?? DEFAULT_WAREHOUSE_ROW_LIMIT,
            ...(input.direction !== undefined ? { direction: input.direction } : {}),
            ...(input.mode !== undefined ? { mode: input.mode } : {}),
          }),
        ),
    );
  }
  return {
    tools,
    availableToolNames: () =>
      Object.keys(tools).filter(
        (name) => sqlCalls.count < options.budget.maxSqlCalls || !sqlToolNames.has(name),
      ),
  };
}
