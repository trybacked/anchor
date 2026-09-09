import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/run.js", () => ({
    runAnchorPipeline: vi.fn(),
    formatPipelineDuration: (ms: number) => `${String(ms)}ms`,
}));

import { runAnchorPipeline } from "../../src/run.js";
import { runTenantPipeline } from "../../src/run-tenant.js";

const mockedRunAnchorPipeline = vi.mocked(runAnchorPipeline);

function mockPipelineResult(runId: string) {
    mockedRunAnchorPipeline.mockResolvedValue({
        runId,
        proposalPath: "/tmp/proposal.json",
        profilePath: "/tmp/profile.json",
        proposal: {
            runId,
            generatedAt: new Date().toISOString(),
            entities: [],
            relations: [],
            rules: [],
            doubts: [],
            questions: [],
        },
        stats: {
            ingestMs: 1,
            documentsMs: 1,
            extractionMs: 1,
            embedMs: 0,
            profileMs: 1,
            proposalMs: 1,
            llmUsage: { inputTokens: 0, outputTokens: 0, costUsd: null },
            skippedLlm: false,
        },
    });
}

describe("runTenantPipeline", () => {
    it("skips inference when all file hashes are already known", async () => {
        mockPipelineResult("run-first");
        const root = await mkdtemp(join(tmpdir(), "tenant-skip-"));
        const content = Buffer.from("same-file");
        const first = await runTenantPipeline({
            dataRoot: root,
            tenantId: "tenant-skip",
            files: [{ fileName: "doc.txt", content }],
            skipEmbed: true,
        });
        expect(first.skipped).toBe(false);
        mockedRunAnchorPipeline.mockClear();
        const second = await runTenantPipeline({
            dataRoot: root,
            tenantId: "tenant-skip",
            files: [{ fileName: "doc.txt", content }],
            skipEmbed: true,
        });
        expect(second.skipped).toBe(true);
        expect(mockedRunAnchorPipeline).not.toHaveBeenCalled();
        expect(existsSync(second.modelPath)).toBe(true);
        expect(existsSync(join(root, "tenants", "tenant-skip", "work"))).toBe(false);
    });

    it("processes only when a new hash appears", async () => {
        const root = await mkdtemp(join(tmpdir(), "tenant-new-"));
        mockedRunAnchorPipeline.mockResolvedValue({
            runId: "run-new",
            proposalPath: "/tmp/proposal.json",
            profilePath: "/tmp/profile.json",
            proposal: {
                runId: "run-new",
                generatedAt: new Date().toISOString(),
                entities: [],
                relations: [],
                rules: [],
                doubts: [],
                questions: [],
            },
            stats: {
                ingestMs: 1,
                documentsMs: 1,
                extractionMs: 1,
                embedMs: 0,
                profileMs: 1,
                proposalMs: 1,
                llmUsage: { inputTokens: 0, outputTokens: 0, costUsd: null },
                skippedLlm: false,
            },
        });
        await runTenantPipeline({
            dataRoot: root,
            tenantId: "tenant-new",
            files: [{ fileName: "a.txt", content: Buffer.from("a") }],
            skipEmbed: true,
        });
        mockedRunAnchorPipeline.mockClear();
        await runTenantPipeline({
            dataRoot: root,
            tenantId: "tenant-new",
            files: [
                { fileName: "a.txt", content: Buffer.from("a") },
                { fileName: "b.txt", content: Buffer.from("b") },
            ],
            skipEmbed: true,
        });
        expect(mockedRunAnchorPipeline).toHaveBeenCalledTimes(1);
    });
});
