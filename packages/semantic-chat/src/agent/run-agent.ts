import { createGatewayProvider } from "@ai-sdk/gateway";
import type { Ontology } from "@trybacked/core";
import type { AnchorService } from "@trybacked/service";
import { generateText, stepCountIs } from "ai";
import { randomUUID } from "node:crypto";
import { buildAgentTools } from "./build-tools.js";
import { SemanticGroundingError, validateAnswerGrounding } from "./grounding.js";
import { buildAgentSystemPrompt } from "./prompt-builder.js";
import {
  DEFAULT_AGENT_BUDGET,
  SemanticAgentError,
  type AgentBudget,
  type SemanticAgentResult,
  type SemanticAgentStep,
  type SemanticAnswerClaim,
  type SemanticClarification,
} from "./types.js";

export { SemanticAgentError } from "./types.js";

export type RunSemanticAgentOptions = {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  apiKey: string;
  modelId: string;
  fallbackModelId?: string | undefined;
  budget?: AgentBudget | undefined;
};

type AgentRunState = {
  terminalAnswer: string | undefined;
  claims: SemanticAnswerClaim[];
  assumptions: string[];
  followUps: string[] ;
  clarification: SemanticClarification | undefined;
};

async function runAgentGeneration(options: {
  ontology: Ontology;
  service: AnchorService;
  question: string;
  apiKey: string;
  modelId: string;
  budget: AgentBudget;
  systemSuffix?: string | undefined;
  steps: SemanticAgentStep[];
  toolResults: Map<string, unknown>;
  state: AgentRunState;
}): Promise<{ inputTokens: number; outputTokens: number; totalTokens: number }> {
  const sqlCalls = { count: 0 };

  const recordStep = (
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
    result: unknown,
    durationMs: number,
  ) => {
    const rowCount =
      typeof result === "object" &&
      result !== null &&
      "rowCount" in result &&
      typeof (result as { rowCount: unknown }).rowCount === "number"
        ? (result as { rowCount: number }).rowCount
        : undefined;
    const sql =
      typeof result === "object" &&
      result !== null &&
      "sql" in result &&
      typeof (result as { sql: unknown }).sql === "string"
        ? (result as { sql: string }).sql
        : undefined;
    options.steps.push({
      toolCallId,
      toolName,
      input,
      durationMs,
      ...(rowCount !== undefined ? { rowCount } : {}),
      ...(sql !== undefined ? { sql } : {}),
    });
    options.toolResults.set(toolCallId, result);
  };

  const tools = buildAgentTools({
    ontology: options.ontology,
    service: options.service,
    budget: options.budget,
    sqlCalls,
    recordStep,
    onTerminalAnswer: (input) => {
      options.state.terminalAnswer = input.answer;
      options.state.claims = input.claims;
      options.state.assumptions = input.assumptions;
      options.state.followUps = input.followUps;
    },
    onClarification: (input) => {
      options.state.clarification = {
        question: input.question,
        options: input.options,
      };
    },
  });

  const model = createGatewayProvider({ apiKey: options.apiKey })(options.modelId);
  const system =
    buildAgentSystemPrompt(options.ontology, options.question) +
    (options.systemSuffix !== undefined ? `\n\n${options.systemSuffix}` : "");

  const generation = await generateText({
    model,
    system,
    prompt: options.question,
    tools,
    stopWhen: stepCountIs(options.budget.maxSteps),
    temperature: 0,
  });

  return {
    inputTokens: generation.usage.inputTokens ?? 0,
    outputTokens: generation.usage.outputTokens ?? 0,
    totalTokens: generation.usage.totalTokens ?? 0,
  };
}

export async function runSemanticAgent(
  options: RunSemanticAgentOptions,
): Promise<SemanticAgentResult> {
  const started = Date.now();
  const runId = randomUUID();
  const budget = options.budget ?? DEFAULT_AGENT_BUDGET;
  const steps: SemanticAgentStep[] = [];
  const toolResults = new Map<string, unknown>();
  const state: AgentRunState = {
    terminalAnswer: undefined,
    claims: [],
    assumptions: [],
    followUps: [],
    clarification: undefined,
  };

  let usageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  try {
    const firstUsage = await runAgentGeneration({
      ontology: options.ontology,
      service: options.service,
      question: options.question,
      apiKey: options.apiKey,
      modelId: options.modelId,
      budget,
      steps,
      toolResults,
      state,
    });
    usageTotals = {
      inputTokens: usageTotals.inputTokens + firstUsage.inputTokens,
      outputTokens: usageTotals.outputTokens + firstUsage.outputTokens,
      totalTokens: usageTotals.totalTokens + firstUsage.totalTokens,
    };
  } catch (error) {
    if (options.fallbackModelId !== undefined && options.fallbackModelId !== options.modelId) {
      const fallbackUsage = await runAgentGeneration({
        ontology: options.ontology,
        service: options.service,
        question: options.question,
        apiKey: options.apiKey,
        modelId: options.fallbackModelId,
        budget,
        steps,
        toolResults,
        state,
      });
      usageTotals = {
        inputTokens: usageTotals.inputTokens + fallbackUsage.inputTokens,
        outputTokens: usageTotals.outputTokens + fallbackUsage.outputTokens,
        totalTokens: usageTotals.totalTokens + fallbackUsage.totalTokens,
      };
    } else {
      throw error;
    }
  }

  const usage = {
    ...usageTotals,
    latencyMs: Date.now() - started,
  };

  if (state.clarification !== undefined) {
    return {
      runId,
      answer: state.clarification.question,
      claims: [],
      assumptions: [],
      followUps: state.clarification.options,
      steps,
      usage,
      clarification: state.clarification,
      toolResults,
    };
  }

  if (state.terminalAnswer === undefined) {
    throw new SemanticAgentError("Agent finished without submit_answer or ask_clarification.");
  }

  const tryGround = (): void => {
    validateAnswerGrounding({
      answer: state.terminalAnswer ?? "",
      claims: state.claims,
      toolResults,
    });
  };

  try {
    tryGround();
  } catch (error) {
    if (!(error instanceof SemanticGroundingError)) {
      throw error;
    }
    state.terminalAnswer = undefined;
    state.claims = [];
    const repairUsage = await runAgentGeneration({
      ontology: options.ontology,
      service: options.service,
      question: options.question,
      apiKey: options.apiKey,
      modelId: options.modelId,
      budget: { ...budget, maxSteps: Math.min(budget.maxSteps, 6) },
      systemSuffix: `Grounding check failed: ${error.message}. Fix claims so every number cites a toolCallId whose result contains that value, then call submit_answer again.`,
      steps,
      toolResults,
      state,
    });
    usageTotals = {
      inputTokens: usageTotals.inputTokens + repairUsage.inputTokens,
      outputTokens: usageTotals.outputTokens + repairUsage.outputTokens,
      totalTokens: usageTotals.totalTokens + repairUsage.totalTokens,
    };
    usage.inputTokens = usageTotals.inputTokens;
    usage.outputTokens = usageTotals.outputTokens;
    usage.totalTokens = usageTotals.totalTokens;
    usage.latencyMs = Date.now() - started;

    if (state.terminalAnswer === undefined) {
      throw new SemanticAgentError(error.message);
    }
    tryGround();
  }

  return {
    runId,
    answer: state.terminalAnswer,
    claims: state.claims,
    assumptions: state.assumptions,
    followUps: state.followUps,
    steps,
    usage,
    toolResults,
  };
}

export function createSemanticAgentModelFromEnv(env: NodeJS.ProcessEnv): {
  modelId: string;
  fallbackModelId?: string | undefined;
  apiKey: string;
} | undefined {
  const apiKey = env["AI_GATEWAY_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }
  const modelId = env["SEMANTIC_CHAT_MODEL"] ?? env["SEMANTIC_MODEL"] ?? "openai/gpt-4o-mini";
  const fallbackModelId = env["SEMANTIC_CHAT_FALLBACK_MODEL"]?.trim();
  return {
    modelId,
    apiKey,
    ...(fallbackModelId !== undefined && fallbackModelId.length > 0
      ? { fallbackModelId }
      : {}),
  };
}
