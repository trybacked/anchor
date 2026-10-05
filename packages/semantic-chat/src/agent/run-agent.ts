import { createGatewayProvider } from "@ai-sdk/gateway";
import { applySemanticCatalogs, type Ontology, type SemanticCatalog } from "@trybacked/core";
import { SHARED_SEMANTIC_CATALOGS } from "@trybacked/ontology-authoring";
import type { AnchorService, ConversationTurn } from "@trybacked/service";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import { randomUUID } from "node:crypto";
import { assertQuestionDoesNotMentionUnknownProperties } from "../query-intent.js";
import { buildAgentTools, type AgentToolEvent } from "./build-tools.js";
import { groundAnswer, SemanticGroundingError } from "./grounding.js";
import {
  AGENT_DEADLINE_MS,
  AGENT_FORCE_ANSWER_AFTER_WAREHOUSE_OK,
  AGENT_GROUNDING_REPAIR_MAX_STEPS,
} from "./limits.js";
import { buildAgentSystemPrompt, type AgentPromptContext } from "./prompt-builder.js";
import {
  DEFAULT_AGENT_BUDGET,
  SemanticAgentError,
  type AgentBudget,
  type AgentTerminal,
  type SemanticAgentResult,
  type SemanticAgentStep,
  type SemanticAgentUsage,
} from "./types.js";
export { SemanticAgentError } from "./types.js";
export type ModelResolver = (modelId: string) => LanguageModel;
export type RunSemanticAgentOptions = {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  locale?: string | undefined;
  history?: readonly ConversationTurn[] | undefined;
  apiKey: string;
  modelId: string;
  fallbackModelId?: string | undefined;
  budget?: AgentBudget | undefined;
  skipRepairAfterMs?: number | undefined;
  semanticCatalogs?: readonly SemanticCatalog[] | undefined;
  resolveModel?: ModelResolver | undefined;
};
type TokenUsage = Omit<SemanticAgentUsage, "latencyMs">;
type AgentRun = {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  prompt: AgentPromptContext;
  deadlineAt: number;
  resolveModel: ModelResolver;
  steps: SemanticAgentStep[];
  toolResults: Map<string, unknown>;
  terminal: AgentTerminal | undefined;
};
export function createGatewayModelResolver(apiKey: string): ModelResolver {
  const gateway = createGatewayProvider({ apiKey });
  return (modelId) => gateway(modelId);
}
const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}
function readResultField<T>(
  result: unknown,
  key: string,
  guard: (value: unknown) => value is T,
): T | undefined {
  if (typeof result !== "object" || result === null || !(key in result)) return undefined;
  const value = (result as Record<string, unknown>)[key];
  return guard(value) ? value : undefined;
}
const isNumber = (value: unknown): value is number => typeof value === "number";
const isString = (value: unknown): value is string => typeof value === "string";
function recordStep(run: AgentRun, event: AgentToolEvent): void {
  const base = {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input,
    durationMs: event.durationMs,
  };
  if (event.status === "error") {
    run.steps.push({ ...base, status: "error", error: event.error });
    return;
  }
  const rowCount = readResultField(event.result, "rowCount", isNumber);
  const sql = readResultField(event.result, "sql", isString);
  run.steps.push({
    ...base,
    status: "ok",
    ...(rowCount !== undefined ? { rowCount } : {}),
    ...(sql !== undefined ? { sql } : {}),
  });
  run.toolResults.set(event.toolCallId, event.result);
}
const DEADLINE_MESSAGE =
  "The assistant could not answer in time. Please try again, or ask a narrower question.";
const TIMEOUT_ERROR_NAMES = new Set(["AbortError", "TimeoutError"]);
/** Time left before the run must give up; zero or less means it already has. */
function remainingMs(run: AgentRun): number {
  return run.deadlineAt - Date.now();
}
/** A hit deadline is a client-facing outcome, not an internal failure to retry. */
async function generateTextWithinDeadline(
  options: Parameters<typeof generateText>[0],
): ReturnType<typeof generateText> {
  try {
    return await generateText(options);
  } catch (error) {
    if (error instanceof Error && TIMEOUT_ERROR_NAMES.has(error.name)) {
      throw new SemanticAgentError(DEADLINE_MESSAGE);
    }
    throw error;
  }
}
async function generate(
  run: AgentRun,
  modelId: string,
  budget: AgentBudget,
  systemSuffix?: string,
): Promise<TokenUsage> {
  const remaining = remainingMs(run);
  if (remaining <= 0) throw new SemanticAgentError(DEADLINE_MESSAGE);
  const toolkit = buildAgentTools({
    ontology: run.ontology,
    service: run.service,
    question: run.question,
    budget,
    recordStep: (event) => {
      recordStep(run, event);
    },
    onTerminal: (terminal) => {
      run.terminal ??= terminal;
    },
  });
  const finalStep = budget.maxSteps - 1;
  const system = buildAgentSystemPrompt(run.prompt);
  const generation = await generateTextWithinDeadline({
    abortSignal: AbortSignal.timeout(remaining),
    model: run.resolveModel(modelId),
    system: systemSuffix !== undefined ? `${system}\n\n${systemSuffix}` : system,
    prompt: run.question,
    tools: toolkit.tools,
    toolChoice: "required",
    stopWhen: [stepCountIs(budget.maxSteps), () => run.terminal !== undefined],
    prepareStep: ({ stepNumber }) => {
      if (stepNumber >= finalStep) {
        return { activeTools: ["submit_answer"] };
      }
      const warehouseOk = run.steps.filter(
        (step) => step.toolName === "query_objects" && step.status === "ok",
      ).length;
      if (warehouseOk >= AGENT_FORCE_ANSWER_AFTER_WAREHOUSE_OK) {
        return { activeTools: ["submit_answer"] };
      }
      const available = toolkit.availableToolNames();
      return available.length === Object.keys(toolkit.tools).length
        ? undefined
        : { activeTools: available };
    },
    temperature: 0,
  });
  return {
    inputTokens: generation.usage.inputTokens ?? 0,
    outputTokens: generation.usage.outputTokens ?? 0,
    totalTokens: generation.usage.totalTokens ?? 0,
  };
}
async function generateWithFallback(
  run: AgentRun,
  options: RunSemanticAgentOptions,
  budget: AgentBudget,
): Promise<TokenUsage> {
  try {
    return await generate(run, options.modelId, budget);
  } catch (error) {
    const fallback = options.fallbackModelId;
    if (
      error instanceof SemanticAgentError ||
      fallback === undefined ||
      fallback === options.modelId
    ) {
      throw error;
    }
    return generate(run, fallback, budget);
  }
}
function groundingFailure(run: AgentRun): SemanticGroundingError | undefined {
  const terminal = run.terminal;
  if (terminal?.kind !== "answer") return undefined;
  try {
    const grounded = groundAnswer({
      answer: terminal.answer,
      claims: terminal.claims,
      steps: run.steps,
      toolResults: run.toolResults,
    });
    run.terminal = { ...terminal, claims: grounded.claims };
    return undefined;
  } catch (error) {
    if (error instanceof SemanticGroundingError) return error;
    throw error;
  }
}
async function repairGrounding(
  run: AgentRun,
  options: RunSemanticAgentOptions,
  budget: AgentBudget,
  mainPassStartedMs: number,
): Promise<TokenUsage> {
  const skipAfter = options.skipRepairAfterMs;
  if (skipAfter !== undefined && Date.now() - mainPassStartedMs >= skipAfter) {
    const failure = groundingFailure(run);
    if (failure !== undefined) {
      throw new SemanticAgentError(failure.message);
    }
    return NO_USAGE;
  }
  const failure = groundingFailure(run);
  if (failure === undefined) return NO_USAGE;
  run.terminal = undefined;
  const usage = await generate(
    run,
    options.modelId,
    { ...budget, maxSteps: Math.min(budget.maxSteps, AGENT_GROUNDING_REPAIR_MAX_STEPS) },
    `Grounding check failed: ${failure.message} Citations are matched to your tool results automatically, so this means no result holds that value: re-run the query that would return it, or drop the number, then call submit_answer again.`,
  );
  const stillFailing = groundingFailure(run);
  if (stillFailing !== undefined) throw new SemanticAgentError(stillFailing.message);
  return usage;
}
function toResult(runId: string, run: AgentRun, usage: SemanticAgentUsage): SemanticAgentResult {
  const terminal = run.terminal;
  if (terminal === undefined) {
    throw new SemanticAgentError("Agent ended without an answer or clarification.");
  }
  const trace = { runId, steps: run.steps, usage, toolResults: run.toolResults };
  switch (terminal.kind) {
    case "answer":
      return {
        ...trace,
        answer: terminal.answer,
        claims: terminal.claims,
        assumptions: terminal.assumptions,
        followUps: terminal.followUps,
      };
    case "clarification":
      return {
        ...trace,
        answer: terminal.question,
        claims: [],
        assumptions: [],
        followUps: terminal.options,
        clarification: { question: terminal.question, options: terminal.options },
      };
    default: {
      const unreachable: never = terminal;
      throw new SemanticAgentError(`Unhandled terminal ${JSON.stringify(unreachable)}`);
    }
  }
}
export async function runSemanticAgent(
  options: RunSemanticAgentOptions,
): Promise<SemanticAgentResult> {
  const started = Date.now();
  const budget = options.budget ?? DEFAULT_AGENT_BUDGET;
  const ontology = applySemanticCatalogs(
    options.ontology,
    options.semanticCatalogs ?? SHARED_SEMANTIC_CATALOGS,
  );
  assertQuestionDoesNotMentionUnknownProperties(ontology, options.question);
  const run: AgentRun = {
    ontology,
    service: options.service,
    question: options.question,
    deadlineAt: started + AGENT_DEADLINE_MS,
    prompt: {
      ontology,
      question: options.question,
      locale: options.locale,
      history: options.history,
    },
    resolveModel: options.resolveModel ?? createGatewayModelResolver(options.apiKey),
    steps: [],
    toolResults: new Map(),
    terminal: undefined,
  };
  const mainStarted = Date.now();
  const mainUsage = await generateWithFallback(run, options, budget);
  const repairUsage = await repairGrounding(run, options, budget, mainStarted);
  const tokens = addUsage(mainUsage, repairUsage);
  return toResult(randomUUID(), run, { ...tokens, latencyMs: Date.now() - started });
}
export function createSemanticAgentModelFromEnv(env: NodeJS.ProcessEnv):
  | {
      modelId: string;
      fallbackModelId?: string | undefined;
      apiKey: string;
    }
  | undefined {
  const apiKey = env["AI_GATEWAY_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  const modelId = env["SEMANTIC_CHAT_MODEL"] ?? env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";
  const fallbackModelId = env["SEMANTIC_CHAT_FALLBACK_MODEL"]?.trim();
  return {
    modelId,
    apiKey,
    ...(fallbackModelId !== undefined && fallbackModelId.length > 0 ? { fallbackModelId } : {}),
  };
}
