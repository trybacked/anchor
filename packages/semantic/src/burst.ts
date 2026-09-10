import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import {
    BURST_RETRY_DELAYS_MS,
    MAX_BURST_ATTEMPTS,
    RAW_FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS,
    RAW_FALLBACK_MAX_OUTPUT_TOKENS,
    STRICT_JSON_SUFFIX,
} from "./constants.js";
import { SEMANTIC_MODEL_ENV } from "./env.js";
import {
    cacheKey,
    loadCachedOutput,
    saveCachedOutput,
    type BurstUsage,
    type LlmCacheContext,
} from "./llm-cache.js";

export type { BurstUsage };

export interface BurstRequest<TSchema extends z.ZodTypeAny> {
    model: LanguageModel;
    system: string;
    prompt: string;
    schema: TSchema;
    schemaName: string;
    timeoutMs?: number;
    onWaiting?: (message: string) => void;
    llmCache?: LlmCacheContext;
}

export interface BurstResult<TOutput> {
    output: TOutput;
    usage: BurstUsage;
    fromCache?: boolean;
}

export const EMPTY_BURST_USAGE: BurstUsage = {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: null,
};

export function sumBurstUsage(...usages: BurstUsage[]): BurstUsage {
    const costs = usages
        .map((usage) => usage.costUsd)
        .filter((cost): cost is number => cost !== null);
    return {
        inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
        outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
        costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
    };
}

type BurstAttemptStrategy = "structured" | "structured_strict" | "raw_json";

function resolveAttemptStrategy(attempt: number): BurstAttemptStrategy {
    if (attempt === MAX_BURST_ATTEMPTS - 1 && attempt > 0) {
        return "raw_json";
    }
    if (attempt > 0) {
        return "structured_strict";
    }
    return "structured";
}

function isRetryableBurstError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return (message.includes("did not match schema") ||
        message.includes("no object generated") ||
        message.includes("no output generated") ||
        message.includes("json parse") ||
        message.includes("invalid json") ||
        message.includes("failed to parse") ||
        message.includes("validation failed") ||
        message.includes("unexpected token") ||
        message.includes("unterminated string") ||
        message.includes("unexpected end of json") ||
        message.includes("timeout") ||
        message.includes("timed out") ||
        message.includes("gateway request failed") ||
        message.includes("invalid error response format"));
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

function toBurstUsage(result: Awaited<ReturnType<typeof generateText>>): BurstUsage {
    return {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        costUsd: extractGatewayCostUsd(result.finalStep.providerMetadata),
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Tolerant JSON recovery for models without native structured output.
 * Many cheap models (e.g. DeepSeek) return nearly-JSON: markdown fences,
 * prose before/after the object, trailing commas. This extracts the first
 * balanced JSON object/array from raw text so it can be validated by the
 * same Zod schema used for strict parsing. Validation is unchanged: only
 * extraction becomes tolerant.
 */
export function extractJsonCandidate(raw: string): string | null {
    if (typeof raw !== "string" || raw.length === 0) {
        return null;
    }
    let text = raw.trim();
    const fence = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    if (fence?.[1] !== undefined) {
        text = fence[1].trim();
    }
    const start = text.search(/[{[]/);
    if (start === -1) {
        return null;
    }
    const open = text[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === undefined) {
            break;
        }
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            if (inString) {
                escaped = true;
            }
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (ch === open) {
            depth += 1;
        }
        else if (ch === close) {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}

function parseJsonText(rawText: string): unknown {
    try {
        return JSON.parse(rawText) as unknown;
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(String(error));
    }
}

function parseWithRecovery<TSchema extends z.ZodTypeAny>(schema: TSchema, rawText: string | undefined): z.infer<TSchema> | undefined {
    if (rawText === undefined) {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = parseJsonText(rawText);
    }
    catch (error) {
        if (isRetryableBurstError(error)) {
            throw error;
        }
        return undefined;
    }
    const direct = schema.safeParse(parsed);
    if (direct.success) {
        return direct.data as z.infer<TSchema>;
    }
    const candidate = extractJsonCandidate(rawText);
    if (candidate !== null) {
        let recoveredParsed: unknown;
        try {
            recoveredParsed = parseJsonText(candidate);
        }
        catch (error) {
            if (isRetryableBurstError(error)) {
                throw error;
            }
            return undefined;
        }
        const recovered = schema.safeParse(recoveredParsed);
        if (recovered.success) {
            return recovered.data as z.infer<TSchema>;
        }
    }
    return undefined;
}

async function serializeBurstSchemaJson(schema: z.ZodTypeAny): Promise<string> {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    return JSON.stringify(zodToJsonSchema(schema as z.ZodType, {
        target: "openApi3",
        $refStrategy: "none",
    }));
}

/**
 * Raw fallback for models whose generateText structured-output mode fails
 * hard (e.g. DeepSeek emitting schema-mismatched objects that throw inside
 * the SDK instead of returning output: undefined). We bypass the SDK's
 * structured-output machinery: no schema in the API call — the JSON schema
 * is embedded in the prompt, and the response is parsed + Zod-validated
 * locally with tolerant extraction.
 */
async function runRawAttempt<TSchema extends z.ZodTypeAny>(
    request: BurstRequest<TSchema>,
    schemaJson: string,
): Promise<BurstResult<z.infer<TSchema>>> {
    request.onWaiting?.(`Waiting for LLM (${request.schemaName}, raw JSON)...`);
    const maxOutputTokens = RAW_FALLBACK_MAX_OUTPUT_TOKENS[request.schemaName] ?? RAW_FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS;
    const system = `${request.system}\n\nRespond with one minimal JSON object that validates against this schema. No markdown fences, no prose, no repetition, no extra fields:\n${schemaJson}`;
    const result = await generateText({
        model: request.model,
        system,
        prompt: request.prompt + STRICT_JSON_SUFFIX,
        temperature: 0,
        maxRetries: 0,
        maxOutputTokens,
        ...(request.timeoutMs !== undefined ? { timeout: { totalMs: request.timeoutMs } } : {}),
    });
    let recovered: z.infer<TSchema> | undefined;
    try {
        recovered = parseWithRecovery(request.schema, result.text);
    }
    catch (error) {
        if (isRetryableBurstError(error)) {
            throw error;
        }
        recovered = undefined;
    }
    if (recovered === undefined) {
        throw new Error(`Unexpected end of JSON input in raw fallback for "${request.schemaName}"`);
    }
    return {
        output: recovered,
        usage: toBurstUsage(result),
    };
}

function resolveBurstCacheKey(
    request: BurstRequest<z.ZodTypeAny>,
    schemaJson: string,
): string | undefined {
    if (request.llmCache === undefined) {
        return undefined;
    }
    return cacheKey({
        modelId: request.llmCache.modelId,
        system: request.system,
        prompt: request.prompt,
        schemaName: request.schemaName,
        schemaJson,
    });
}

async function readValidatedBurstCache<TSchema extends z.ZodTypeAny>(
    request: BurstRequest<TSchema>,
    key: string,
): Promise<BurstResult<z.infer<TSchema>> | undefined> {
    const llmCache = request.llmCache;
    if (llmCache === undefined) {
        return undefined;
    }
    const hit = await loadCachedOutput(llmCache.cacheDir, key);
    if (hit === undefined) {
        return undefined;
    }
    const parsed = request.schema.safeParse(hit.output);
    if (!parsed.success) {
        return undefined;
    }
    return {
        output: parsed.data as z.infer<TSchema>,
        usage: hit.usage,
        fromCache: true,
    };
}

async function runStructuredAttempt<TSchema extends z.ZodTypeAny>(
    request: BurstRequest<TSchema>,
    onWaiting: ((message: string) => void) | undefined,
    forceStrictJson: boolean,
): Promise<BurstResult<z.infer<TSchema>>> {
    onWaiting?.(`Waiting for LLM (${request.schemaName})...`);
    const prompt = forceStrictJson ? request.prompt + STRICT_JSON_SUFFIX : request.prompt;
    const result = await generateText({
        model: request.model,
        output: Output.object({ schema: request.schema }),
        system: request.system,
        prompt,
        temperature: 0,
        maxRetries: 0,
        ...(request.timeoutMs !== undefined ? { timeout: { totalMs: request.timeoutMs } } : {}),
    });
    if (result.output !== undefined) {
        return {
            output: result.output as z.infer<TSchema>,
            usage: toBurstUsage(result),
        };
    }
    const recovered = parseWithRecovery(request.schema, result.text);
    if (recovered !== undefined) {
        return {
            output: recovered,
            usage: toBurstUsage(result),
        };
    }
    throw new Error(`No output generated for "${request.schemaName}"`);
}

async function executeBurstAttempt<TSchema extends z.ZodTypeAny>(
    request: BurstRequest<TSchema>,
    strategy: BurstAttemptStrategy,
    schemaJson: string,
): Promise<BurstResult<z.infer<TSchema>>> {
    switch (strategy) {
        case "raw_json":
            return runRawAttempt(request, schemaJson);
        case "structured_strict":
            return runStructuredAttempt(request, request.onWaiting, true);
        case "structured":
            return runStructuredAttempt(request, request.onWaiting, false);
        default: {
            const _exhaustive: never = strategy;
            return _exhaustive;
        }
    }
}

export async function runBurst<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>): Promise<BurstResult<z.infer<TSchema>>> {
    const schemaJson = await serializeBurstSchemaJson(request.schema);
    const cacheKeyValue = resolveBurstCacheKey(request, schemaJson);
    if (cacheKeyValue !== undefined) {
        const cached = await readValidatedBurstCache(request, cacheKeyValue);
        if (cached !== undefined) {
            return cached;
        }
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_BURST_ATTEMPTS; attempt += 1) {
        const delayMs = BURST_RETRY_DELAYS_MS[attempt] ?? 0;
        if (delayMs > 0) {
            await sleep(delayMs);
        }
        const strategy = resolveAttemptStrategy(attempt);
        try {
            const result = await executeBurstAttempt(request, strategy, schemaJson);
            const llmCache = request.llmCache;
            if (strategy !== "raw_json" && cacheKeyValue !== undefined && llmCache !== undefined) {
                await saveCachedOutput(llmCache.cacheDir, cacheKeyValue, result.output, result.usage);
            }
            return result;
        }
        catch (error) {
            lastError = error;
            if (!isRetryableBurstError(error)) {
                break;
            }
        }
    }
    if (lastError instanceof Error && isRetryableBurstError(lastError)) {
        const detail = lastError.message.length > 0 ? ` Last error: ${lastError.message}` : "";
        throw new Error(`LLM returned invalid JSON for "${request.schemaName}" after ${String(MAX_BURST_ATTEMPTS)} attempts.${detail} Retry; if it persists, change ${SEMANTIC_MODEL_ENV} in .env.`);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
