import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Semantic from "@backed/semantic";
import {
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_FILES,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";

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
            entities: [{
                id: "customer",
                name: "Customer",
                sourceTable: "customers",
                status: "proposed",
                confidence: 0.9,
                provenance: { table: "customers", evidence: "test" },
                properties: [],
            }],
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

import type { RunStatusResponse } from "../src/api-types.js";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { RunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

function createTestConfig(dataRoot: string): WorkerServiceConfig {
    return {
        host: DEFAULT_HOST,
        port: 0,
        dataRoot,
        authToken: "test-token",
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
        maxUploadFiles: DEFAULT_MAX_UPLOAD_FILES,
        rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        skipEmbed: true,
    };
}

async function waitForRunDone(baseUrl: string, tenantId: string, runId: string, authToken: string): Promise<RunStatusResponse> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/runs/${runId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as RunStatusResponse;
        if (payload.status === "done" || payload.status === "failed") {
            return payload;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
    }
    throw new Error(`run ${runId} did not finish within 30s`);
}

describe("worker-service tenant pipeline e2e", () => {
    let dataRoot: string;
    let close: () => Promise<void>;
    let baseUrl: string;
    const authToken = "test-token";

    beforeEach(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "worker-e2e-"));
        const runStore = new RunStore();
        const service = await startWorkerService({
            config: createTestConfig(dataRoot),
            runStore,
        });
        baseUrl = service.url;
        close = service.close;
    });

    afterEach(async () => {
        await close();
    });

    it("runs the real tenant pipeline on uploaded CSV and persists model.yaml", async () => {
        const tenantId = "acme";
        const csv = "id,name\n1,Acme\n2,Beta\n";
        const boundary = "----backed-e2e";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="customers.csv"',
            "",
            csv,
            `--${boundary}--`,
            "",
        ].join("\r\n");

        const submit = await fetch(`${baseUrl}/v1/tenants/${tenantId}/runs`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        const { runId } = (await submit.json()) as { runId: string };
        expect(runId).toBeTruthy();

        const status = await waitForRunDone(baseUrl, tenantId, runId, authToken);
        expect(status.status).toBe("done");
        expect(status.deletionEntry?.filesDeleted).toBeGreaterThan(0);

        const modelPath = join(dataRoot, "tenants", tenantId, "persist", "model.yaml");
        expect(existsSync(modelPath)).toBe(true);
        const modelYaml = readFileSync(modelPath, "utf8");
        expect(modelYaml).toContain("formatVersion");

        expect(existsSync(join(dataRoot, "tenants", tenantId, "work"))).toBe(false);

        const deletionLogPath = join(dataRoot, "tenants", tenantId, "persist", "deletion-log.jsonl");
        expect(existsSync(deletionLogPath)).toBe(true);
        const logLines = readFileSync(deletionLogPath, "utf8").trim().split("\n");
        expect(logLines.length).toBeGreaterThan(0);
        const lastEntry = JSON.parse(logLines.at(-1) ?? "{}") as { runId: string };
        expect(lastEntry.runId).toBe(runId);

        const modelResponse = await fetch(`${baseUrl}/v1/tenants/${tenantId}/model`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        expect(modelResponse.status).toBe(200);
        expect(modelResponse.headers.get("etag")).toBeTruthy();
    });
});
