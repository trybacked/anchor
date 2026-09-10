import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKSPACE_CONFIG } from "@backed/core";
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
            entities: [{ id: "customer", name: "Customer", sourceTable: "customers", status: "proposed", confidence: 0.9, provenance: { table: "customers", evidence: "test" }, properties: [] }],
            relations: [],
            rules: [],
            doubts: [],
            questions: [],
            usage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        })),
        splitTablesByKind: vi.fn((tables) => ({
            lineDocuments: [],
            businessStructured: tables,
            pipelineMetadata: [],
            allTables: tables,
            totalTableCount: tables.length,
        })),
        compressProfile: vi.fn((profile) => profile),
        discoverDomain: vi.fn(async () => ({
            vocabulary: actual.EMPTY_DOMAIN_VOCABULARY,
            usage: actual.EMPTY_BURST_USAGE,
            degraded: false,
        })),
    };
});

import { runTenantPipeline } from "../../src/run-tenant.js";

describe("tenant pipeline integration", () => {
    it("runs ingest, persists model, writes deletion log, and removes work/", async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), "tenant-integration-"));
        const sourcesDir = join(dataRoot, "sources");
        await mkdir(sourcesDir, { recursive: true });
        await writeFile(join(sourcesDir, "customers.csv"), "id,name\n1,Acme\n", "utf8");

        const first = await runTenantPipeline({
            dataRoot,
            tenantId: "acme",
            files: [{ fileName: "customers.csv", content: Buffer.from("id,name\n1,Acme\n", "utf8") }],
            skipEmbed: true,
            config: DEFAULT_WORKSPACE_CONFIG,
        });

        expect(first.skipped).toBe(false);
        expect(existsSync(first.modelPath)).toBe(true);
        expect(existsSync(join(dataRoot, "tenants", "acme", "work"))).toBe(false);

        const deletionLogPath = join(dataRoot, "tenants", "acme", "persist", "deletion-log.jsonl");
        expect(existsSync(deletionLogPath)).toBe(true);
        const logLines = readFileSync(deletionLogPath, "utf8").trim().split("\n");
        expect(logLines.length).toBeGreaterThan(0);
        const lastEntry = JSON.parse(logLines.at(-1) ?? "{}") as { runId: string; filesDeleted: number };
        expect(lastEntry.runId).toBe(first.runId);
        expect(lastEntry.filesDeleted).toBeGreaterThan(0);

        const second = await runTenantPipeline({
            dataRoot,
            tenantId: "acme",
            files: [{ fileName: "customers.csv", content: Buffer.from("id,name\n1,Acme\n", "utf8") }],
            skipEmbed: true,
        });
        expect(second.skipped).toBe(true);
        expect(second.stats.skippedLlm).toBe(true);
    });
});
