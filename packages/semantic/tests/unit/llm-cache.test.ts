import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheKey, loadCachedOutput, saveCachedOutput } from "../../src/llm-cache.js";

describe("cacheKey", () => {
    it("is deterministic for identical inputs", () => {
        const input = {
            modelId: "zai/glm-5.3-flash",
            system: "system",
            prompt: "prompt",
            schemaName: "ontology_proposal",
            schemaJson: "{}",
        };
        const first = cacheKey(input);
        const second = cacheKey(input);
        expect(first).toBe(second);
        expect(first).toMatch(/^[0-9a-f]{16}$/);
    });

    it("changes when model, prompt, or schema changes", () => {
        const base = {
            modelId: "model-a",
            system: "system",
            prompt: "prompt",
            schemaName: "schema",
            schemaJson: "{}",
        };
        expect(cacheKey(base)).not.toBe(cacheKey({ ...base, modelId: "model-b" }));
        expect(cacheKey(base)).not.toBe(cacheKey({ ...base, prompt: "other prompt" }));
        expect(cacheKey(base)).not.toBe(cacheKey({ ...base, schemaJson: '{"x":1}' }));
        expect(cacheKey(base)).not.toBe(cacheKey({ ...base, system: "other system" }));
        expect(cacheKey(base)).not.toBe(cacheKey({ ...base, schemaName: "other_schema" }));
    });
});

describe("loadCachedOutput / saveCachedOutput", () => {
    it("save then load returns the output and usage", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        await saveCachedOutput(dir, "abc123def4567890", { answer: 42 }, {
            inputTokens: 10,
            outputTokens: 5,
            costUsd: 0.001,
        });
        const hit = await loadCachedOutput(dir, "abc123def4567890");
        expect(hit?.output).toEqual({ answer: 42 });
        expect(hit?.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            costUsd: 0.001,
        });
    });

    it("missing key returns undefined", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        expect(await loadCachedOutput(dir, "missingkey000000")).toBeUndefined();
    });

    it("corrupt cache file returns undefined without throwing", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        await writeFile(join(dir, "bad000000000000.json"), "{not json", "utf8");
        await expect(loadCachedOutput(dir, "bad000000000000")).resolves.toBeUndefined();
    });

    it("invalid cache payload returns undefined without throwing", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        await writeFile(join(dir, "empty000000000000.json"), "{}", "utf8");
        expect(await loadCachedOutput(dir, "empty000000000000")).toBeUndefined();
    });

    it("rejects unsafe cache keys", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        await expect(saveCachedOutput(dir, "../escape", {}, {
            inputTokens: 0,
            outputTokens: 0,
            costUsd: null,
        })).rejects.toThrow();
        await expect(loadCachedOutput(dir, "../escape")).resolves.toBeUndefined();
    });

    it("persists JSON to disk", async () => {
        const dir = await mkdtemp(join(tmpdir(), "backed-llm-cache-"));
        const key = "deadbeefcafebabe";
        await saveCachedOutput(dir, key, { ok: true }, {
            inputTokens: 1,
            outputTokens: 2,
            costUsd: null,
        });
        const raw = await readFile(join(dir, `${key}.json`), "utf8");
        expect(JSON.parse(raw)).toEqual({
            output: { ok: true },
            usage: { inputTokens: 1, outputTokens: 2, costUsd: null },
        });
    });
});
