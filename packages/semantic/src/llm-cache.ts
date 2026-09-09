import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export interface CachedBurstUsage {
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
}

const CACHE_KEY_PATTERN = /^[0-9a-f]{16}$/;

export interface CacheKeyInput {
    modelId: string;
    system: string;
    prompt: string;
    schemaName: string;
    schemaJson: string;
}

export interface CachedLlmPayload {
    output: unknown;
    usage: CachedBurstUsage;
}

export interface LlmCacheContext {
    cacheDir: string;
    modelId: string;
}

export function burstCacheFields(context: LlmCacheContext | undefined): {
    cacheDir?: string;
    modelId?: string;
} {
    if (context === undefined) {
        return {};
    }
    return {
        cacheDir: context.cacheDir,
        modelId: context.modelId,
    };
}

export function cacheKey(input: CacheKeyInput): string {
    const payload = [
        input.modelId,
        input.system,
        input.prompt,
        input.schemaName,
        input.schemaJson,
    ].join("\0");
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function isValidCacheKey(key: string): boolean {
    return CACHE_KEY_PATTERN.test(key);
}

function cacheFilePath(cacheDir: string, key: string): string | undefined {
    if (!isValidCacheKey(key)) {
        return undefined;
    }
    return join(cacheDir, `${key}.json`);
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

export async function saveCachedOutput(cacheDir: string, key: string, output: unknown, usage: CachedBurstUsage): Promise<void> {
    const filePath = cacheFilePath(cacheDir, key);
    if (filePath === undefined) {
        throw new Error(`Invalid LLM cache key: ${key}`);
    }
    await mkdir(cacheDir, { recursive: true });
    const payload: CachedLlmPayload = { output, usage };
    await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}
