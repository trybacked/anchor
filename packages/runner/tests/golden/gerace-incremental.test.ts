import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseModelYaml, type Relation, type SemanticModel } from "@backed/core";
import { handleGeraceBurst } from "./gerace-burst-handler.js";
import { buildIncrementalTestFile, loadGeraceSourceFiles } from "./gerace-fixture.js";

const llmStats = vi.hoisted(() => ({
    calls: 0,
    reset(): void {
        this.calls = 0;
    },
}));

vi.mock("../../../semantic/dist/burst.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../semantic/dist/burst.js")>();
    return {
        ...actual,
        runBurst: vi.fn(async (request: Parameters<typeof handleGeraceBurst>[0]) => {
            llmStats.calls += 1;
            return handleGeraceBurst(request);
        }),
    };
});

import { runTenantPipeline } from "../../src/run-tenant.js";

const TEST_ENV = {
    AI_GATEWAY_API_KEY: "test-key-for-golden-mock",
    SEMANTIC_MODEL: "mock/gerace-golden",
};

function entityIds(model: SemanticModel): string[] {
    return model.entities.map((entity) => entity.id).sort();
}

function relationSignatures(model: SemanticModel): string[] {
    return model.relations
        .map((relation: Relation) => `${relation.id}|${relation.fromEntity}|${relation.toEntity}|${relation.name}`)
        .sort();
}

function loadPersistedModel(modelPath: string): SemanticModel {
    return parseModelYaml(readFileSync(modelPath, "utf8"));
}

describe("Gerace golden incremental session", () => {
    beforeEach(() => {
        llmStats.reset();
    });

    it("cold → warm → +1 file keeps entity stability and reduces LLM on increment", async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), "gerace-golden-"));
        const tenantId = "gerace";
        const corpusFiles = loadGeraceSourceFiles();
        const incrementalFile = buildIncrementalTestFile();

        const coldLlmBefore = llmStats.calls;
        const cold = await runTenantPipeline({
            dataRoot,
            tenantId,
            files: corpusFiles,
            forceFull: true,
            skipEmbed: true,
            env: TEST_ENV,
        });
        const coldLlmCalls = llmStats.calls - coldLlmBefore;

        expect(cold.skipped).toBe(false);
        const coldModel = loadPersistedModel(cold.modelPath);
        expect(coldModel.entities.length).toBeGreaterThan(0);
        expect(coldModel.relations.length).toBeGreaterThan(0);
        expect(coldLlmCalls).toBeGreaterThan(0);

        const vocabularyAfterCold = readFileSync(
            join(dataRoot, "tenants", tenantId, "persist", "vocabulary.json"),
            "utf8",
        );

        const warmLlmBefore = llmStats.calls;
        const warm = await runTenantPipeline({
            dataRoot,
            tenantId,
            files: corpusFiles,
            skipEmbed: true,
            env: TEST_ENV,
        });
        const warmLlmCalls = llmStats.calls - warmLlmBefore;

        expect(warm.skipped).toBe(true);
        expect(warmLlmCalls).toBe(0);

        const warmModel = loadPersistedModel(warm.modelPath);
        expect(entityIds(warmModel)).toEqual(entityIds(coldModel));
        expect(relationSignatures(warmModel)).toEqual(relationSignatures(coldModel));

        const vocabularyAfterWarm = readFileSync(
            join(dataRoot, "tenants", tenantId, "persist", "vocabulary.json"),
            "utf8",
        );
        expect(vocabularyAfterWarm).toBe(vocabularyAfterCold);

        const incrementalLlmBefore = llmStats.calls;
        const incremental = await runTenantPipeline({
            dataRoot,
            tenantId,
            files: [...corpusFiles, incrementalFile],
            skipEmbed: true,
            env: TEST_ENV,
        });
        const incrementalLlmCalls = llmStats.calls - incrementalLlmBefore;

        expect(incremental.skipped).toBe(false);
        expect(incrementalLlmCalls).toBeGreaterThan(0);
        expect(incrementalLlmCalls).toBeLessThan(coldLlmCalls);
        expect(incrementalLlmCalls).toBeLessThanOrEqual(6);

        const incrementalModel = loadPersistedModel(incremental.modelPath);
        const coldEntityIds = new Set(entityIds(coldModel));
        for (const entityId of coldEntityIds) {
            expect(entityIds(incrementalModel)).toContain(entityId);
        }

        const vocabularyAfterIncremental = readFileSync(
            join(dataRoot, "tenants", tenantId, "persist", "vocabulary.json"),
            "utf8",
        );
        expect(vocabularyAfterIncremental).toBe(vocabularyAfterCold);
    }, 300_000);
});
