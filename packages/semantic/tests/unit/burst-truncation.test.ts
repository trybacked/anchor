import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("ai", () => ({
    Output: {
        object: vi.fn(({ schema }: { schema: z.ZodTypeAny }) => ({ schema })),
    },
    generateText: vi.fn(),
}));

import { generateText } from "ai";
import { MAX_BURST_ATTEMPTS } from "../../src/constants.js";
import { runBurst } from "../../src/burst.js";

const TestSchema = z.object({ answer: z.number() });
const mockModel = {} as LanguageModel;

function buildRequest(cacheDir: string) {
    return {
        model: mockModel,
        system: "system prompt",
        prompt: "user prompt",
        schema: TestSchema,
        schemaName: "test_schema",
        llmCache: {
            cacheDir,
            modelId: "test/model",
        },
    };
}

describe("runBurst truncated JSON retry", () => {
    let cacheDir: string;

    beforeEach(async () => {
        vi.mocked(generateText).mockReset();
        cacheDir = await mkdtemp(join(tmpdir(), "backed-burst-truncation-"));
    });

    it("retries truncated JSON through strict and raw fallback attempts", async () => {
        vi.mocked(generateText)
            .mockResolvedValueOnce({
                output: undefined,
                usage: { inputTokens: 1, outputTokens: 1 },
                finalStep: { providerMetadata: {} },
                text: '{"answer": 42',
            } as never)
            .mockResolvedValueOnce({
                output: undefined,
                usage: { inputTokens: 1, outputTokens: 1 },
                finalStep: { providerMetadata: {} },
                text: '{"answer": 42',
            } as never)
            .mockResolvedValueOnce({
                output: undefined,
                usage: { inputTokens: 1, outputTokens: 1 },
                finalStep: { providerMetadata: {} },
                text: '{"answer":42}',
            } as never);

        const result = await runBurst(buildRequest(cacheDir));
        expect(result.output).toEqual({ answer: 42 });
        expect(generateText).toHaveBeenCalledTimes(MAX_BURST_ATTEMPTS);
    });

    it("throws a wrapped error after all truncated JSON attempts fail", async () => {
        vi.mocked(generateText).mockResolvedValue({
            output: undefined,
            usage: { inputTokens: 1, outputTokens: 1 },
            finalStep: { providerMetadata: {} },
            text: '{"answer": 42',
        } as never);

        await expect(runBurst(buildRequest(cacheDir))).rejects.toThrow(
            `LLM returned invalid JSON for "test_schema" after ${String(MAX_BURST_ATTEMPTS)} attempts`,
        );
        expect(generateText).toHaveBeenCalledTimes(MAX_BURST_ATTEMPTS);
    });
});
