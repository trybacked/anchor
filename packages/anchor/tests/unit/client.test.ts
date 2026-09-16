import { describe, expect, it, vi } from "vitest";
import { AnchorClient, AnchorClientError, verifyWebhookSignature } from "../../src/index.js";
import { buildRunUploadFormData } from "../../src/upload.js";
import { signWebhookPayload } from "../../src/webhook.js";
import { waitForRun } from "../../src/wait-for-run.js";

const MINIMAL_MODEL_YAML = `
metadata:
  formatVersion: "1"
  runId: run-test
  generatedAt: "2026-01-01T00:00:00.000Z"
entities: []
relations: []
rules: []
`.trim();

describe("buildRunUploadFormData", () => {
    it("requires at least one file", () => {
        expect(() => buildRunUploadFormData([])).toThrow(/At least one file/);
    });

    it("accepts filename/content pairs", () => {
        const form = buildRunUploadFormData([{ filename: "demo.csv", content: "a,b\n1,2" }]);
        expect(form.get("file")).toBeInstanceOf(Blob);
    });
});

describe("webhook helpers", () => {
    it("verifies signatures produced by signWebhookPayload", () => {
        const body = JSON.stringify({ event: "run.completed", tenantId: "demo", runId: "run-1" });
        const signature = signWebhookPayload(body, "whsec_test");
        expect(verifyWebhookSignature(body, "whsec_test", signature)).toBe(true);
        expect(verifyWebhookSignature(body, "whsec_test", "invalid")).toBe(false);
    });
});

describe("AnchorClient", () => {
    it("loads health without auth errors", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({
                ok: true,
                service: "backed-worker-service",
                version: "0.1.0",
                dataRootWritable: true,
            }),
        );

        const client = new AnchorClient({
            baseUrl: "http://127.0.0.1:8790",
            token: "bkd_live_test",
            fetch: fetchImpl,
        });

        const health = await client.health();
        expect(health.ok).toBe(true);
    });

    it("throws AnchorClientError on unauthorized responses", async () => {
        const fetchImpl = vi.fn(async () =>
            Response.json({ error: "unauthorized", message: "Missing token" }, { status: 401 }),
        );

        const client = new AnchorClient({
            baseUrl: "http://127.0.0.1:8790",
            token: "invalid",
            fetch: fetchImpl,
        });

        await expect(client.getRunStatus("demo", "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({
            name: "AnchorClientError",
            status: 401,
            code: "unauthorized",
        } satisfies Partial<AnchorClientError>);
    });

    it("parses model.yaml responses", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input.toString();
            if (url.endsWith("/model")) {
                return new Response(MINIMAL_MODEL_YAML, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/yaml",
                        ETag: '"abc123"',
                    },
                });
            }
            return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
        });

        const client = new AnchorClient({
            baseUrl: "http://127.0.0.1:8790",
            token: "bkd_live_test",
            fetch: fetchImpl,
        });

        const result = await client.getModel("demo");
        expect("notModified" in result && result.notModified === true).toBe(false);
        if ("model" in result) {
            expect(result.model.entities).toEqual([]);
            expect(result.etag).toBe('"abc123"');
        }
    });
});

describe("waitForRun", () => {
    it("polls until the run reaches a terminal state", async () => {
        let calls = 0;
        const reader = {
            getRunStatus: vi.fn(async () => {
                calls += 1;
                if (calls < 3) {
                    return { status: "running" as const };
                }
                return { status: "done" as const, stats: undefined };
            }),
        };

        const result = await waitForRun(reader, "demo", "00000000-0000-4000-8000-000000000001", {
            intervalMs: 1,
        });

        expect(result.status).toBe("done");
        expect(reader.getRunStatus).toHaveBeenCalledTimes(3);
    });
});
