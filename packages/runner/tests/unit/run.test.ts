import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACE_CONFIG, writeWorkspaceConfig } from "@backed/core";
import type * as Semantic from "@backed/semantic";

vi.mock("@backed/semantic", async (importOriginal) => {
    const actual = await importOriginal<typeof Semantic>();
    return {
        ...actual,
        resolveSemanticModels: vi.fn(() => ({
            language: {},
            embedding: {},
        })),
        proposeModel: vi.fn(async ({ runId }) => ({
            runId,
            generatedAt: new Date().toISOString(),
            entities: [],
            relations: [],
            rules: [],
            doubts: [],
            questions: [],
            usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        })),
        splitTablesByKind: vi.fn(() => ({
            lineDocuments: [],
            businessStructured: [],
            pipelineMetadata: [],
            allTables: [],
            totalTableCount: 0,
        })),
        compressProfile: vi.fn((profile) => profile),
    };
});

import { runAnchorPipeline } from "../../src/run.js";

describe("runAnchorPipeline", () => {
    it("writes proposal artifacts for a tabular workspace", async () => {
        const workspaceDir = await mkdtemp(join(tmpdir(), "runner-workspace-"));
        writeWorkspaceConfig(workspaceDir, DEFAULT_WORKSPACE_CONFIG);
        const sourcesDir = join(workspaceDir, "sources");
        await mkdir(sourcesDir, { recursive: true });
        await writeFile(join(sourcesDir, "customers.csv"), "id,name\n1,Acme\n", "utf8");
        const result = await runAnchorPipeline({
            workspaceDir,
            skipEmbed: true,
        });
        expect(existsSync(result.proposalPath)).toBe(true);
        expect(existsSync(result.profilePath)).toBe(true);
        expect(result.proposal.runId).toBe(result.runId);
    });
});
