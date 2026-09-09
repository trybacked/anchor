import { readdir } from "node:fs/promises";
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
        cacheDir,
        modelId: "test/model",
    };
}

describe("runBurst disk cache", () => {
    let cacheDir: string;

    beforeEach(async () => {
        vi.mocked(generateText).mockReset();
        cacheDir = await mkdtemp(join(tmpdir(), "backed-burst-cache-"));
    });

    it("uses cache on second call with identical request", async () => {
        vi.mocked(generateText).mockResolvedValue({
            output: { answer: 42 },
            usage: { inputTokens: 10, outputTokens: 5 },
            finalStep: { providerMetadata: {} },
            text: undefined,
        } as never);
        const request = buildRequest(cacheDir);
        const first = await runBurst(request);
        const second = await runBurst(request);
        expect(generateText).toHaveBeenCalledTimes(1);
        expect(first.output).toEqual({ answer: 42 });
        expect(second.output).toEqual({ answer: 42 });
        expect(second.fromCache).toBe(true);
    });

    it("does not write cache when the first attempt fails and the second succeeds", async () => {
        vi.mocked(generateText)
            .mockRejectedValueOnce(new Error("did not match schema"))
            .mockResolvedValueOnce({
                output: { answer: 7 },
                usage: { inputTokens: 3, outputTokens: 2 },
                finalStep: { providerMetadata: {} },
                text: undefined,
            } as never);
        const result = await runBurst(buildRequest(cacheDir));
        expect(result.output).toEqual({ answer: 7 });
        expect(generateText).toHaveBeenCalledTimes(2);
        expect(await readdir(cacheDir)).toHaveLength(1);
    });

    it("does not cache raw fallback results", async () => {
        vi.mocked(generateText)
            .mockRejectedValueOnce(new Error("did not match schema"))
            .mockRejectedValueOnce(new Error("no output generated"))
            .mockResolvedValueOnce({
                output: undefined,
                usage: { inputTokens: 8, outputTokens: 4 },
                finalStep: { providerMetadata: {} },
                text: '{"answer":99}',
            } as never);
        const result = await runBurst(buildRequest(cacheDir));
        expect(result.output).toEqual({ answer: 99 });
        expect(generateText).toHaveBeenCalledTimes(3);
        expect(await readdir(cacheDir)).toHaveLength(0);
    });

    it("bypasses corrupt cache entries and calls the model", async () => {
        const { writeFile, readdir } = await import("node:fs/promises");
        vi.mocked(generateText).mockResolvedValue({
            output: { answer: 1 },
            usage: { inputTokens: 1, outputTokens: 1 },
            finalStep: { providerMetadata: {} },
            text: undefined,
        } as never);
        const request = buildRequest(cacheDir);
        await runBurst(request);
        const [cachedFile] = await readdir(cacheDir);
        expect(cachedFile).toBeDefined();
        await writeFile(join(cacheDir, cachedFile!), "{broken", "utf8");
        vi.mocked(generateText).mockClear();
        vi.mocked(generateText).mockResolvedValue({
            output: { answer: 2 },
            usage: { inputTokens: 2, outputTokens: 2 },
            finalStep: { providerMetadata: {} },
            text: undefined,
        } as never);
        const recovered = await runBurst(request);
        expect(generateText).toHaveBeenCalledTimes(1);
        expect(recovered.output).toEqual({ answer: 2 });
        expect(recovered.fromCache).toBeUndefined();
    });
});
