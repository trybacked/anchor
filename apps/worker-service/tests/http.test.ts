import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
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
import { StaleReviewError } from "../src/review-store.js";

vi.mock("@backed/runner", async (importOriginal) => {
    const actual = await importOriginal<typeof Runner>();
    return {
        ...actual,
        runTenantPipeline: vi.fn(),
    };
});

import type * as ReviewStore from "../src/review-store.js";

vi.mock("../src/review-store.js", async (importOriginal) => {
    const actual = await importOriginal<typeof ReviewStore>();
    return {
        ...actual,
        loadTenantProposal: vi.fn(),
        applyTenantReview: vi.fn(),
    };
});

import { runTenantPipeline, TenantPipelineError } from "@backed/runner";
import type { RunStatusResponse } from "../src/api-types.js";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { applyTenantReview, loadTenantProposal } from "../src/review-store.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

const mockedRunTenantPipeline = vi.mocked(runTenantPipeline);
const mockedLoadTenantProposal = vi.mocked(loadTenantProposal);
const mockedApplyTenantReview = vi.mocked(applyTenantReview);

function createTestConfig(dataRoot: string): WorkerServiceConfig {
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
    };
}

function authHeaders(token = "test-token"): HeadersInit {
    return { Authorization: `Bearer ${token}` };
}

describe("worker-service HTTP contract", () => {
    let dataRoot: string;
    let close: () => Promise<void>;
    let baseUrl: string;

    beforeEach(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "worker-http-"));
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
                skippedLlm: false,
            },
            deletionEntry: {
                runId: "run-123",
                tenantId: "demo",
                deletedAt: new Date().toISOString(),
                filesDeleted: 1,
                bytesDeleted: 64,
            },
        });
        mockedLoadTenantProposal.mockReturnValue(null);
        const service = await startWorkerService({
            config: createTestConfig(dataRoot),
            runStore: new MemoryRunStore(),
        });
        baseUrl = service.url;
        close = service.close;
    });

    afterEach(async () => {
        await close();
        vi.clearAllMocks();
    });

    it("returns 401 without bearer auth", async () => {
        const response = await fetch(`${baseUrl}/v1/tenants/demo/model`);
        expect(response.status).toBe(401);
    });

    it("returns 400 for invalid tenant ids", async () => {
        const response = await fetch(`${baseUrl}/v1/tenants/INVALID%20TENANT/model`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(400);
    });

    it("surfaces failureMessage on failed runs", async () => {
        const runStore = new MemoryRunStore();
        const service = await startWorkerService({
            config: createTestConfig(dataRoot),
            runStore,
        });
        runStore.create("demo", "failed-run");
        runStore.fail("demo", "failed-run", "pipeline exploded");
        const response = await fetch(`${service.url}/v1/tenants/demo/runs/failed-run`, {
            headers: authHeaders(),
        });
        await service.close();
        expect(response.status).toBe(200);
        const payload = (await response.json()) as RunStatusResponse;
        expect(payload.status).toBe("failed");
        expect(payload.failureMessage).toBe("pipeline exploded");
    });

    it("surfaces deletionEntry when async pipeline fails", async () => {
        mockedRunTenantPipeline.mockRejectedValueOnce(new TenantPipelineError("pipeline exploded", {
            runId: "failed-run",
            tenantId: "demo",
            deletedAt: new Date().toISOString(),
            filesDeleted: 3,
            bytesDeleted: 128,
        }));
        const runStore = new MemoryRunStore();
        const service = await startWorkerService({
            config: createTestConfig(dataRoot),
            runStore,
        });
        const boundary = "----backed-fail";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="bad.csv"',
            "",
            "id\n1",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const submit = await fetch(`${service.url}/v1/tenants/demo/runs`, {
            method: "POST",
            headers: {
                ...authHeaders(),
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        const { runId } = (await submit.json()) as { runId: string };
        await new Promise((resolve) => {
            setTimeout(resolve, 30);
        });
        const response = await fetch(`${service.url}/v1/tenants/demo/runs/${runId}`, {
            headers: authHeaders(),
        });
        await service.close();
        const payload = (await response.json()) as RunStatusResponse;
        expect(payload.status).toBe("failed");
        expect(payload.failureMessage).toBe("pipeline exploded");
        expect(payload.deletionEntry?.filesDeleted).toBe(3);
    });

    it("returns 403 when partner token accesses a foreign tenant", async () => {
        const service = await startWorkerService({
            config: {
                ...createTestConfig(dataRoot),
                authToken: "",
                partners: [{
                    partnerId: "partner-a",
                    token: "partner-a-secret",
                    tenantIdPattern: "^partner-a-",
                }],
            },
            runStore: new MemoryRunStore(),
        });
        const response = await fetch(`${service.url}/v1/tenants/acme/model`, {
            headers: authHeaders("partner-a-secret"),
        });
        await service.close();
        expect(response.status).toBe(403);
    });

    it("returns skipped stats when re-submitting known files", async () => {
        mockedRunTenantPipeline.mockResolvedValueOnce({
            runId: "run-skip",
            tenantId: "demo",
            skipped: true,
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
                runId: "run-skip",
                tenantId: "demo",
                deletedAt: new Date().toISOString(),
                filesDeleted: 1,
                bytesDeleted: 32,
            },
        });
        const boundary = "----backed-resubmit";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="same.txt"',
            "",
            "unchanged",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const submit = await fetch(`${baseUrl}/v1/tenants/demo/runs`, {
            method: "POST",
            headers: {
                ...authHeaders(),
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        const { runId } = (await submit.json()) as { runId: string };
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
        const status = await fetch(`${baseUrl}/v1/tenants/demo/runs/${runId}`, {
            headers: authHeaders(),
        });
        const payload = (await status.json()) as RunStatusResponse;
        expect(payload.status).toBe("done");
        expect(payload.stats?.skippedLlm).toBe(true);
    });

    it("returns review questions when a proposal exists", async () => {
        mockedLoadTenantProposal.mockReturnValue({
            runId: "run-1",
            generatedAt: new Date().toISOString(),
            entities: [],
            relations: [],
            rules: [],
            doubts: [],
            questions: [{
                id: "q1",
                kind: "entity",
                targetId: "e1",
                question: "Confirm?",
                impact: 0.5,
                uncertainty: 0.5,
                risk: 0.5,
                evidence: { title: "t", columns: ["a"], rows: [["b"]] },
            }],
        });
        const response = await fetch(`${baseUrl}/v1/tenants/demo/review`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(200);
        const payload = (await response.json()) as { runId: string; questions: unknown[] };
        expect(payload.runId).toBe("run-1");
        expect(payload.questions).toHaveLength(1);
    });

    it("returns 404 when review is unavailable", async () => {
        mockedLoadTenantProposal.mockReturnValue(null);
        const response = await fetch(`${baseUrl}/v1/tenants/demo/review`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(404);
    });

    it("returns 409 for stale review answers", async () => {
        mockedApplyTenantReview.mockRejectedValue(new StaleReviewError(2));
        const response = await fetch(`${baseUrl}/v1/tenants/demo/review`, {
            method: "POST",
            headers: {
                ...authHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                answers: [{ questionId: "q1", decision: "yes" }],
            }),
        });
        expect(response.status).toBe(409);
        const payload = (await response.json()) as { error: string; staleAnswerCount: number };
        expect(payload.error).toBe("stale_review_answers");
        expect(payload.staleAnswerCount).toBe(2);
    });

    it("returns model yaml with ETag when persist file exists", async () => {
        const modelDir = join(dataRoot, "tenants", "demo", "persist");
        await mkdir(modelDir, { recursive: true });
        await writeFile(join(modelDir, "model.yaml"), "metadata:\n  formatVersion: \"1\"\n", "utf8");
        const response = await fetch(`${baseUrl}/v1/tenants/demo/model`, {
            headers: authHeaders(),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("etag")).toBeTruthy();
        expect(await response.text()).toContain("formatVersion");
    });
});
