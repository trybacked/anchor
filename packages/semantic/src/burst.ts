/**
 * Single agentic burst: one structured-output call with a fixed schema and
 * bounded retries. Follows the previous repo's gateway pattern
 * (generateText + Output.object), generalized over any AI SDK LanguageModel
 * so tests can inject mock models.
 */

import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

const MAX_BURST_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 750, 2000] as const;

export interface BurstRequest<TSchema extends z.ZodTypeAny> {
  model: LanguageModel;
  system: string;
  prompt: string;
  schema: TSchema;
  schemaName: string;
}

export interface BurstUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface BurstResult<TOutput> {
  output: TOutput;
  usage: BurstUsage;
}

function isRetryableBurstError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("did not match schema") ||
    message.includes("no object generated") ||
    message.includes("no output generated") ||
    message.includes("json parse") ||
    message.includes("invalid json") ||
    message.includes("failed to parse") ||
    message.includes("validation failed") ||
    message.includes("unexpected token")
  );
}

function extractGatewayCostUsd(providerMetadata: unknown): number | null {
  if (providerMetadata === null || typeof providerMetadata !== "object") {
    return null;
  }
  const gateway = (providerMetadata as Record<string, unknown>)["gateway"];
  if (gateway === null || typeof gateway !== "object") {
    return null;
  }
  const cost = (gateway as Record<string, unknown>)["cost"];
  const parsed = typeof cost === "string" ? Number.parseFloat(cost) : cost;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runAttempt<TSchema extends z.ZodTypeAny>(
  request: BurstRequest<TSchema>,
): Promise<BurstResult<z.infer<TSchema>>> {
  const result = await generateText({
    model: request.model,
    output: Output.object({ schema: request.schema }),
    system: request.system,
    prompt: request.prompt,
    temperature: 0,
    maxRetries: 0,
  });

  if (result.output === undefined) {
    throw new Error(`No output generated for "${request.schemaName}"`);
  }

  return {
    output: result.output as z.infer<TSchema>,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      costUsd: extractGatewayCostUsd(result.finalStep.providerMetadata),
    },
  };
}

export async function runBurst<TSchema extends z.ZodTypeAny>(
  request: BurstRequest<TSchema>,
): Promise<BurstResult<z.infer<TSchema>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_BURST_ATTEMPTS; attempt += 1) {
    const delayMs = RETRY_DELAYS_MS[attempt] ?? 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      return await runAttempt(request);
    } catch (error) {
      lastError = error;
      if (!isRetryableBurstError(error)) {
        break;
      }
    }
  }

  if (lastError instanceof Error && isRetryableBurstError(lastError)) {
    throw new Error(
      `Il modello LLM ha restituito JSON non valido per "${request.schemaName}" dopo ${String(MAX_BURST_ATTEMPTS)} tentativi. Riprova; se persiste, cambia modello (SEMANTIC_MODEL_CHEAP / SEMANTIC_MODEL_FRONTIER).`,
    );
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
