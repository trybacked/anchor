import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import { SEMANTIC_MODEL_ENV } from "./env.js";
import { BURST_RETRY_DELAYS_MS, MAX_BURST_ATTEMPTS, RAW_FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS, RAW_FALLBACK_MAX_OUTPUT_TOKENS, } from "./constants.js";
import { cacheKey, loadCachedOutput, saveCachedOutput } from "./llm-cache.js";
export interface BurstRequest<TSchema extends z.ZodTypeAny> {
    model: LanguageModel;
    system: string;
    prompt: string;
    schema: TSchema;
    schemaName: string;
    timeoutMs?: number;
    onWaiting?: (message: string) => void;
    cacheDir?: string;
    modelId?: string;
}
export interface BurstUsage {
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
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
    // strip markdown fences: ```json ... ``` or ``` ... ```
    const fence = text.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
    if (fence?.[1] !== undefined) {
        text = fence[1].trim();
    }
    // find first '{' or '[' and brace-match to its balanced end
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
function parseWithRecovery<TSchema extends z.ZodTypeAny>(schema: TSchema, rawText: string | undefined): z.infer<TSchema> | undefined {
    if (rawText === undefined) {
        return undefined;
    }
    // 1) direct parse (strict path — unchanged for well-behaved models)
    try {
        return schema.parse(JSON.parse(rawText));
    }
    catch {
        // fall through to recovery
    }
    // 2) tolerant extraction + same schema validation
    const candidate = extractJsonCandidate(rawText);
    if (candidate !== null) {
        try {
            return schema.parse(JSON.parse(candidate));
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
const STRICT_JSON_SUFFIX = "\n\nIMPORTANT: respond with ONLY the raw JSON object matching the schema. No markdown fences, no prose before or after, no trailing commas. Your entire response must be valid JSON.";
/**
 * Raw fallback for models whose generateText structured-output mode fails
 * hard (e.g. DeepSeek emitting schema-mismatched objects that throw inside
 * the SDK instead of returning output: undefined). We bypass the SDK's
 * structured-output machinery: no schema in the API call — the JSON schema
 * is embedded in the prompt, and the response is parsed + Zod-validated
 * locally with tolerant extraction.
 */
async function runRawAttempt<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>): Promise<BurstResult<z.infer<TSchema>>> {
    request.onWaiting?.(`Waiting for LLM (${request.schemaName}, raw JSON)...`);
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const jsonSchema = JSON.stringify(zodToJsonSchema(request.schema, {
        target: "openApi3",
        $refStrategy: "none",
    }));
    const maxOutputTokens = RAW_FALLBACK_MAX_OUTPUT_TOKENS[request.schemaName] ?? RAW_FALLBACK_DEFAULT_MAX_OUTPUT_TOKENS;
    const system = `${request.system}\n\nRespond with one minimal JSON object that validates against this schema. No markdown fences, no prose, no repetition, no extra fields:\n${jsonSchema}`;
    const result = await generateText({
        model: request.model,
        system,
        prompt: request.prompt + STRICT_JSON_SUFFIX,
        temperature: 0,
        maxRetries: 0,
        maxOutputTokens,
        ...(request.timeoutMs !== undefined ? { timeout: { totalMs: request.timeoutMs } } : {}),
    });
    const recovered = parseWithRecovery(request.schema, result.text);
    if (recovered === undefined) {
        throw new Error(`Raw JSON fallback failed to produce schema-valid output for "${request.schemaName}"`);
    }
    return {
        output: recovered,
        usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            costUsd: extractGatewayCostUsd(result.finalStep.providerMetadata),
        },
    };
}
async function serializeBurstSchemaJson<TSchema extends z.ZodTypeAny>(schema: TSchema): Promise<string> {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    return JSON.stringify(zodToJsonSchema(schema, {
        target: "openApi3",
        $refStrategy: "none",
    }));
}

async function resolveBurstCacheKey<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>): Promise<string | undefined> {
    if (request.cacheDir === undefined || request.modelId === undefined) {
        return undefined;
    }
    const schemaJson = await serializeBurstSchemaJson(request.schema);
    return cacheKey({
        modelId: request.modelId,
        system: request.system,
        prompt: request.prompt,
        schemaName: request.schemaName,
        schemaJson,
    });
}

async function readValidatedBurstCache<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>, key: string): Promise<BurstResult<z.infer<TSchema>> | undefined> {
    const hit = await loadCachedOutput(request.cacheDir!, key);
    if (hit === undefined) {
        return undefined;
    }
    try {
        return {
            output: request.schema.parse(hit.output),
            usage: hit.usage,
            fromCache: true,
        };
    }
    catch {
        return undefined;
    }
}

async function runAttempt<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>, onWaiting?: (message: string) => void, forceStrictJson = false): Promise<BurstResult<z.infer<TSchema>>> {
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
    // structured-output path (native or SDK-injected schema)
    if (result.output !== undefined) {
        return {
            output: result.output as z.infer<TSchema>,
            usage: {
                inputTokens: result.usage.inputTokens ?? 0,
                outputTokens: result.usage.outputTokens ?? 0,
                costUsd: extractGatewayCostUsd(result.finalStep.providerMetadata),
            },
        };
    }
    // recovery path: model produced text that failed schema validation —
    // try tolerant extraction before giving up (cheap models often emit
    // valid JSON wrapped in fences or prose).
    const recovered = parseWithRecovery(request.schema, result.text);
    if (recovered !== undefined) {
        return {
            output: recovered,
            usage: {
                inputTokens: result.usage.inputTokens ?? 0,
                outputTokens: result.usage.outputTokens ?? 0,
                costUsd: extractGatewayCostUsd(result.finalStep.providerMetadata),
            },
        };
    }
    throw new Error(`No output generated for "${request.schemaName}"`);
}
export async function runBurst<TSchema extends z.ZodTypeAny>(request: BurstRequest<TSchema>): Promise<BurstResult<z.infer<TSchema>>> {
    const cacheKeyValue = await resolveBurstCacheKey(request);
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
        try {
            // attempt 0: clean prompt (native structured output path);
            // attempt 1: same path with strict-JSON forcing appended;
            // final attempt: raw fallback — schema in prompt, local parsing
            // and Zod validation (rescues models whose structured-output
            // mode fails hard, e.g. DeepSeek).
            const isRawFallback = attempt === MAX_BURST_ATTEMPTS - 1 && attempt > 0;
            const result = isRawFallback
                ? await runRawAttempt(request)
                : await runAttempt(request, request.onWaiting, attempt > 0);
            if (!isRawFallback && cacheKeyValue !== undefined && request.cacheDir !== undefined) {
                await saveCachedOutput(request.cacheDir, cacheKeyValue, result.output, result.usage);
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
