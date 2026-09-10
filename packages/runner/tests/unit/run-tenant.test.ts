import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

async function mockPipelineResult(runId: string, workspaceDir?: string) {
    const profilePath = workspaceDir === undefined
        ? join(tmpdir(), `profile-${runId}.json`)
        : join(workspaceDir, ".backed", "runs", runId, "profile.json");
    await mkdir(dirname(profilePath), { recursive: true });
    await writeFile(profilePath, JSON.stringify([{
        table: "a",
        sourceFile: "a.txt",
        rowCount: 1,
        columns: [],
    }]), "utf8");
    mockedRunAnchorPipeline.mockResolvedValue({
        runId,
        proposalPath: join(dirname(profilePath), "proposal.json"),
        profilePath,
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
        const root = await mkdtemp(join(tmpdir(), "tenant-skip-"));
        await mockPipelineResult("run-first", join(root, "tenants", "tenant-skip", "work"));
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
        const tenantRoot = join(root, "tenants", "tenant-new", "work");
        await mockPipelineResult("run-new", tenantRoot);
        await runTenantPipeline({
            dataRoot: root,
            tenantId: "tenant-new",
            files: [{ fileName: "a.txt", content: Buffer.from("a") }],
            skipEmbed: true,
        });
        mockedRunAnchorPipeline.mockClear();
        await mockPipelineResult("run-new-b", tenantRoot);
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

    it("never writes uploaded source bytes under persist/", async () => {
        const root = await mkdtemp(join(tmpdir(), "tenant-persist-"));
        const tenantId = "tenant-persist";
        const rawCorpus = "id,secret\n1,classified\n";
        await mockPipelineResult("run-upload", join(root, "tenants", tenantId, "work"));
        await runTenantPipeline({
            dataRoot: root,
            tenantId,
            files: [{ fileName: "customers.csv", content: Buffer.from(rawCorpus) }],
            skipEmbed: true,
        });
        const persistDir = join(root, "tenants", tenantId, "persist");
        const allowed = new Set([
            "model.yaml",
            "ledger.json",
            "deletion-log.jsonl",
            "proposal.json",
            "review.json",
            "vocabulary.json",
            "documents.json",
            "profile.json",
        ]);
        for (const fileName of await readdir(persistDir)) {
            expect(allowed.has(fileName)).toBe(true);
            const content = await readFile(join(persistDir, fileName), "utf8");
            expect(content).not.toContain("classified");
            expect(content).not.toContain(rawCorpus.trim());
        }
        expect(existsSync(join(root, "tenants", tenantId, "work"))).toBe(false);
    });

    it("returns deletion proof when the pipeline fails", async () => {
        mockedRunAnchorPipeline.mockRejectedValue(new Error("pipeline failed"));
        const root = await mkdtemp(join(tmpdir(), "tenant-fail-"));
        const tenantId = "tenant-fail";
        await expect(runTenantPipeline({
            dataRoot: root,
            tenantId,
            files: [{ fileName: "doc.txt", content: Buffer.from("boom") }],
            skipEmbed: true,
        })).rejects.toMatchObject({
            name: "TenantPipelineError",
            deletionEntry: {
                tenantId,
                filesDeleted: expect.any(Number) as number,
            },
        });
        expect(existsSync(join(root, "tenants", tenantId, "work"))).toBe(false);
    });
});
