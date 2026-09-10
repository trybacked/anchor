import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";
import {
    deliverRunCompletedWebhook,
    RUN_COMPLETED_WEBHOOK_EVENT,
    signWebhookPayload,
    WEBHOOK_SIGNATURE_HEADER,
} from "../src/webhook.js";

vi.mock("@backed/runner", async (importOriginal) => {
    const actual = await importOriginal<typeof Runner>();
    return {
        ...actual,
        runTenantPipeline: vi.fn(),
    };
});

import { runTenantPipeline, TenantPipelineError } from "@backed/runner";

const mockedRunTenantPipeline = vi.mocked(runTenantPipeline);

interface CapturedWebhook {
    body: string;
    signature: string | null;
}

function createWebhookReceiver(): Promise<{
    url: string;
    captured: CapturedWebhook[];
    close: () => Promise<void>;
}> {
    const captured: CapturedWebhook[] = [];
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });
        request.on("end", () => {
            captured.push({
                body: Buffer.concat(chunks).toString("utf8"),
                signature: request.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()]?.toString() ?? null,
            });
            response.writeHead(200);
            response.end("ok");
        });
    });
    return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                reject(new Error("Unable to bind webhook receiver"));
                return;
            }
            resolve({
                url: `http://127.0.0.1:${String(address.port)}/webhook`,
                captured,
                close: () => new Promise<void>((closeResolve, closeReject) => {
                    server.close((error) => {
                        if (error) {
                            closeReject(error);
                            return;
                        }
                        closeResolve();
                    });
                }),
            });
        });
    });
}

function createPartnerConfig(dataRoot: string, webhookUrl: string): WorkerServiceConfig {
    return {
        host: DEFAULT_HOST,
        port: 0,
        dataRoot,
        authToken: "",
        partners: [{
            partnerId: "partner-a",
            token: "partner-a-secret",
            tenantIdPattern: "^partner-a-",
            webhookSecret: "whsec_test",
            webhooks: { runCompleted: webhookUrl },
        }],
        maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
        maxUploadFiles: DEFAULT_MAX_UPLOAD_FILES,
        rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        skipEmbed: true,
    };
}

describe("run.completed webhooks", () => {
    let dataRoot: string;

    beforeEach(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "worker-webhook-"));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("signs payloads with HMAC-SHA256", () => {
        const body = JSON.stringify({ event: RUN_COMPLETED_WEBHOOK_EVENT });
        expect(signWebhookPayload(body, "secret")).toBe(signWebhookPayload(body, "secret"));
        expect(signWebhookPayload(body, "secret")).not.toBe(signWebhookPayload(body, "other"));
    });

    it("retries failed deliveries up to three times", async () => {
        let attempts = 0;
        const fetchImpl = vi.fn(async () => {
            attempts += 1;
            return new Response("fail", { status: 500 });
        });
        const delivered = await deliverRunCompletedWebhook({
            url: "https://example.com/webhook",
            secret: "secret",
            payload: {
                event: RUN_COMPLETED_WEBHOOK_EVENT,
                tenantId: "partner-a-client-1",
                runId: "run-1",
                status: "done",
                skipped: false,
            },
            fetchImpl,
        });
        expect(delivered).toBe(false);
        expect(attempts).toBe(3);
    });

    it("delivers webhook on successful run completion", async () => {
        const receiver = await createWebhookReceiver();
        mockedRunTenantPipeline.mockResolvedValueOnce({
            runId: "run-done",
            tenantId: "partner-a-client-1",
            skipped: false,
            modelPath: join(dataRoot, "tenants", "partner-a-client-1", "persist", "model.yaml"),
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
                runId: "run-done",
                tenantId: "partner-a-client-1",
                deletedAt: new Date().toISOString(),
                filesDeleted: 1,
                bytesDeleted: 64,
            },
        });
        const modelDir = join(dataRoot, "tenants", "partner-a-client-1", "persist");
        await mkdir(modelDir, { recursive: true });
        await writeFile(join(modelDir, "model.yaml"), "metadata:\n  formatVersion: \"1\"\n", "utf8");
        const service = await startWorkerService({
            config: createPartnerConfig(dataRoot, receiver.url),
            runStore: new MemoryRunStore(),
        });
        const boundary = "----backed-webhook";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="data.csv"',
            "",
            "id\n1",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const submit = await fetch(`${service.url}/v1/tenants/partner-a-client-1/runs`, {
            method: "POST",
            headers: {
                Authorization: "Bearer partner-a-secret",
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        await service.close();
        await receiver.close();
        expect(receiver.captured).toHaveLength(1);
        const payload = JSON.parse(receiver.captured[0]!.body) as {
            event: string;
            status: string;
            skipped: boolean;
            modelEtag?: string;
        };
        expect(payload.event).toBe(RUN_COMPLETED_WEBHOOK_EVENT);
        expect(payload.status).toBe("done");
        expect(payload.skipped).toBe(false);
        expect(payload.modelEtag).toMatch(/^"[0-9a-f]{16}"$/);
        expect(receiver.captured[0]!.signature).toBe(
            signWebhookPayload(receiver.captured[0]!.body, "whsec_test"),
        );
    });

    it("delivers webhook on failed runs with deletionEntry", async () => {
        const receiver = await createWebhookReceiver();
        mockedRunTenantPipeline.mockRejectedValueOnce(new TenantPipelineError("pipeline exploded", {
            runId: "run-fail",
            tenantId: "partner-a-client-1",
            deletedAt: new Date().toISOString(),
            filesDeleted: 2,
            bytesDeleted: 128,
        }));
        const service = await startWorkerService({
            config: createPartnerConfig(dataRoot, receiver.url),
            runStore: new MemoryRunStore(),
        });
        const boundary = "----backed-webhook-fail";
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="bad.csv"',
            "",
            "id\n1",
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const submit = await fetch(`${service.url}/v1/tenants/partner-a-client-1/runs`, {
            method: "POST",
            headers: {
                Authorization: "Bearer partner-a-secret",
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });
        expect(submit.status).toBe(202);
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        await service.close();
        await receiver.close();
        expect(receiver.captured).toHaveLength(1);
        const payload = JSON.parse(receiver.captured[0]!.body) as {
            status: string;
            skipped: boolean;
            deletionEntry?: { filesDeleted: number };
        };
        expect(payload.status).toBe("failed");
        expect(payload.skipped).toBe(false);
        expect(payload.deletionEntry?.filesDeleted).toBe(2);
    });
});
