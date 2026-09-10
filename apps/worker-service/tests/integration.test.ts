import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_FILES,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";
import type * as Runner from "@backed/runner";

vi.mock("@backed/runner", async (importOriginal) => {
    const actual = await importOriginal<typeof Runner>();
    return {
        ...actual,
        runTenantPipeline: vi.fn(),
    };
});

import { runTenantPipeline } from "@backed/runner";
import type { RunStatusResponse } from "../src/api-types.js";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

const mockedRunTenantPipeline = vi.mocked(runTenantPipeline);

function createTestConfig(dataRoot: string, overrides: Partial<WorkerServiceConfig> = {}): WorkerServiceConfig {
    return {
        host: DEFAULT_HOST,
        port: 0,
        dataRoot,
        authToken: "test-token",
        partners: [],
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
        maxUploadFiles: DEFAULT_MAX_UPLOAD_FILES,
        rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        skipEmbed: true,
        ...overrides,
    };
}

describe("worker-service integration", () => {
    let dataRoot: string;
    let close: () => Promise<void>;
    let baseUrl: string;
    const authToken = "test-token";

    beforeEach(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "worker-data-"));
        mockedRunTenantPipeline.mockResolvedValue({
            runId: "run-123",
            tenantId: "demo",
            skipped: false,
            modelPath: join(dataRoot, "tenants", "demo", "persist", "model.yaml"),
            stats: {
                ingestMs: 0,
                documentsMs: 0,
                extractionMs: 0,
                embedMs: 0,
                profileMs: 0,
                proposalMs: 0,
                llmUsage: { inputTokens: 0, outputTokens: 0, costUsd: null },
                skippedLlm: true,
            },
            deletionEntry: {
                runId: "run-123",
                tenantId: "demo",
                deletedAt: new Date().toISOString(),
                filesDeleted: 2,
                bytesDeleted: 128,
            },
        });
        const runStore = new MemoryRunStore();
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

    it("accepts a multipart run submission and exposes model metadata", async () => {
        const boundary = "----backed-test";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="doc.txt"',
            "",
            "hello world",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const submit = await fetch(`${baseUrl}/v1/tenants/demo/runs`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        const payload = (await submit.json()) as { runId: string };
        expect(payload.runId).toBeTruthy();
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
        const status = await fetch(`${baseUrl}/v1/tenants/demo/runs/${payload.runId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        expect(status.status).toBe(200);
        const statusPayload = (await status.json()) as RunStatusResponse;
        expect(statusPayload.status).toBe("done");
        expect(statusPayload.deletionEntry?.filesDeleted).toBeGreaterThan(0);
        expect(existsSync(join(dataRoot, "tenants", "demo", "work"))).toBe(false);
        expect(mockedRunTenantPipeline).toHaveBeenCalledWith(expect.objectContaining({
            skipEmbed: true,
        }));
    });
});
