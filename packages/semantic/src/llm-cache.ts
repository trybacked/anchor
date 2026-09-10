import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LLM_CACHE_FILE_SUFFIX, LLM_CACHE_KEY_HEX_LENGTH } from "./constants.js";

export interface BurstUsage {
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
}

export type CachedBurstUsage = BurstUsage;

const CACHE_KEY_PATTERN = new RegExp(`^[0-9a-f]{${String(LLM_CACHE_KEY_HEX_LENGTH)}}$`);

export interface CacheKeyInput {
    modelId: string;
    system: string;
    prompt: string;
    schemaName: string;
    schemaJson: string;
}

export interface CachedLlmPayload {
    output: unknown;
    usage: BurstUsage;
}

export interface LlmCacheContext {
    cacheDir: string;
    modelId: string;
}

export function withLlmCache(context: LlmCacheContext | undefined): { llmCache: LlmCacheContext } | Record<string, never> {
    if (context === undefined) {
        return {};
    }
    return { llmCache: context };
}

export function cacheKey(input: CacheKeyInput): string {
    const payload = [
        input.modelId,
        input.system,
        input.prompt,
        input.schemaName,
        input.schemaJson,
    ].join("\0");
    return createHash("sha256").update(payload).digest("hex").slice(0, LLM_CACHE_KEY_HEX_LENGTH);
}

function isValidCacheKey(key: string): boolean {
    return CACHE_KEY_PATTERN.test(key);
}

function cacheFilePath(cacheDir: string, key: string): string | undefined {
    if (!isValidCacheKey(key)) {
        return undefined;
    }
    return join(cacheDir, `${key}${LLM_CACHE_FILE_SUFFIX}`);
}

function parseCachedPayload(raw: string): CachedLlmPayload | undefined {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed === null || typeof parsed !== "object") {
            return undefined;
        }
        const record = parsed as Record<string, unknown>;
        if (!("output" in record) || !("usage" in record)) {
            return undefined;
        }
        const usage = record["usage"];
        if (usage === null || typeof usage !== "object") {
            return undefined;
        }
        const usageRecord = usage as Record<string, unknown>;
        const inputTokens = usageRecord["inputTokens"];
        const outputTokens = usageRecord["outputTokens"];
        const costUsd = usageRecord["costUsd"];
        if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
            return undefined;
        }
        if (costUsd !== null && typeof costUsd !== "number") {
            return undefined;
        }
        return {
            output: record["output"],
            usage: {
                inputTokens,
                outputTokens,
                costUsd: costUsd === null ? null : costUsd,
            },
        };
    }
    catch {
        return undefined;
    }
}

export async function loadCachedOutput(cacheDir: string, key: string): Promise<CachedLlmPayload | undefined> {
    const filePath = cacheFilePath(cacheDir, key);
    if (filePath === undefined) {
        return undefined;
    }
    try {
        const raw = await readFile(filePath, "utf8");
        return parseCachedPayload(raw);
    }
    catch {
        return undefined;
    }
}

export async function saveCachedOutput(cacheDir: string, key: string, output: unknown, usage: BurstUsage): Promise<void> {
    const filePath = cacheFilePath(cacheDir, key);
    if (filePath === undefined) {
        throw new Error(`Invalid LLM cache key: ${key}`);
    }
    await mkdir(cacheDir, { recursive: true });
    const payload: CachedLlmPayload = { output, usage };
    await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}
