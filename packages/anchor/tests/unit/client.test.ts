import { describe, expect, it, vi } from "vitest";
import {
  AnchorClient,
  AnchorClientError,
  AnchorValidationError,
  AnchorWaitError,
  AnchorWebhookError,
  createRobustFetch,
  mergeAbortSignals,
  parseApiError,
  parseRunCompletedWebhook,
  RUN_COMPLETED_WEBHOOK_EVENT,
  waitForRun,
} from "../../src/index.js";
import { buildRunUploadFormData } from "../../src/upload.js";
import { signWebhookPayload, verifyWebhookSignature } from "../../src/webhook/crypto.js";

const MINIMAL_MODEL_YAML = `
metadata:
  formatVersion: "1"
  runId: run-test
  generatedAt: "2026-01-01T00:00:00.000Z"
entities: []
relations: []
rules: []
`.trim();

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers });
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function resolveRequestInit(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  if (input instanceof Request) {
    return { method: input.method, ...init };
  }
  return init ?? {};
}

function createMockFetch(
  handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveFetchUrl(input);
    const requestInit = resolveRequestInit(input, init);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(requestInit);
      }
    }
    return jsonResponse({ error: "not_found", message: "No mock handler" }, 404);
  }) as typeof fetch;
}

describe("AnchorClient constructor", () => {
  it("rejects empty baseUrl", () => {
    expect(() => new AnchorClient({ baseUrl: "  ", token: "token" })).toThrow(
      AnchorValidationError,
    );
  });

  it("rejects empty token", () => {
    expect(() => new AnchorClient({ baseUrl: "http://localhost", token: "" })).toThrow(
      AnchorValidationError,
    );
  });
});

describe("buildRunUploadFormData", () => {
  it("requires at least one file", () => {
    expect(() => buildRunUploadFormData([])).toThrow(/At least one file/);
  });

  it("accepts filename/content pairs", () => {
    const form = buildRunUploadFormData([{ filename: "demo.csv", content: "a,b\n1,2" }]);
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("serializes optional pipeline config", () => {
    const form = buildRunUploadFormData([{ filename: "demo.pdf", content: "pdf" }], {
      documentTypeHints: [
        {
          match: "determinazioni",
          documentType: "municipal_determination",
          documentTypeLabel: "Determinazione",
          confidence: 0.95,
        },
      ],
    });
    expect(form.get("config")).toBe(
      JSON.stringify({
        documentTypeHints: [
          {
            match: "determinazioni",
            documentType: "municipal_determination",
            documentTypeLabel: "Determinazione",
            confidence: 0.95,
          },
        ],
      }),
    );
  });
});

describe("parseApiError", () => {
  it("returns undefined for invalid shapes", () => {
    expect(parseApiError(null)).toBeUndefined();
    expect(parseApiError({ message: "missing code" })).toBeUndefined();
  });

  it("parses known ApiError fields", () => {
    expect(parseApiError({ error: "too_many_files", maxFiles: 3 })).toEqual({
      error: "too_many_files",
      maxFiles: 3,
    });
  });
});

describe("AnchorClientError.fromResponse", () => {
  it("handles non-JSON error bodies", async () => {
    const error = await AnchorClientError.fromResponse(
      new Response("plain text", { status: 502 }),
      "upstream failed",
    );
    expect(error.status).toBe(502);
    expect(error.message).toBe("upstream failed");
  });
});

describe("webhook helpers", () => {
  it("verifies signatures produced by signWebhookPayload", () => {
    const body = JSON.stringify({
      event: RUN_COMPLETED_WEBHOOK_EVENT,
      tenantId: "demo",
      runId: "run-1",
    });
    const signature = signWebhookPayload(body, "whsec_test");
    expect(verifyWebhookSignature(body, "whsec_test", signature)).toBe(true);
    expect(verifyWebhookSignature(body, "whsec_test", "invalid")).toBe(false);
  });

  it("parses valid run.completed payloads", () => {
    const payload = parseRunCompletedWebhook(
      JSON.stringify({
        event: RUN_COMPLETED_WEBHOOK_EVENT,
        tenantId: "demo",
        runId: "run-1",
        status: "done",
        skipped: false,
        modelEtag: '"etag"',
      }),
    );
    expect(payload.tenantId).toBe("demo");
    expect(payload.modelEtag).toBe('"etag"');
  });

  it("rejects malformed webhook payloads", () => {
    expect(() => parseRunCompletedWebhook("not-json")).toThrow(AnchorWebhookError);
    expect(() => parseRunCompletedWebhook(JSON.stringify({ event: "other" }))).toThrow(
      AnchorWebhookError,
    );
    expect(() =>
      parseRunCompletedWebhook(
        JSON.stringify({
          event: RUN_COMPLETED_WEBHOOK_EVENT,
          tenantId: "demo",
          runId: "run-1",
          status: "done",
          skipped: "no",
        }),
      ),
    ).toThrow(AnchorWebhookError);
  });

  it("validates deletionEntry shape", () => {
    expect(() =>
      parseRunCompletedWebhook(
        JSON.stringify({
          event: RUN_COMPLETED_WEBHOOK_EVENT,
          tenantId: "demo",
          runId: "run-1",
          status: "failed",
          skipped: true,
          deletionEntry: { filesDeleted: 1 },
        }),
      ),
    ).toThrow(AnchorWebhookError);
  });
});

describe("createRobustFetch", () => {
  it("retries transient 5xx responses when enabled", async () => {
    let calls = 0;
    const baseFetch = vi.fn(async () => {
      calls += 1;
      return new Response("error", { status: 503 });
    });
    const fetchImpl = createRobustFetch(baseFetch, {
      retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2 },
    });
    const response = await fetchImpl("http://example.test/health");
    expect(response.status).toBe(503);
    expect(calls).toBe(3);
  });

  it("merges abort signals", () => {
    const controller = new AbortController();
    const merged = mergeAbortSignals(controller.signal, undefined);
    expect(merged).toBe(controller.signal);
  });
});

describe("AnchorClient", () => {
  it("loads health without auth errors", async () => {
    const fetchImpl = createMockFetch({
      "/health": () =>
        jsonResponse({
          ok: true,
          service: "backed-worker-service",
          version: "0.1.0",
          dataRootWritable: true,
        }),
    });

    const client = new AnchorClient({
      baseUrl: "http://127.0.0.1:8790",
      token: "bkd_live_test",
      fetch: fetchImpl as typeof fetch,
    });

    const health = await client.health();
    expect(health.ok).toBe(true);
  });

  it("throws AnchorClientError on unauthorized responses", async () => {
    const fetchImpl = createMockFetch({
      "/runs/": () => jsonResponse({ error: "unauthorized", message: "Missing token" }, 401),
    });

    const client = new AnchorClient({
      baseUrl: "http://127.0.0.1:8790",
      token: "invalid",
      fetch: fetchImpl as typeof fetch,
    });

    await expect(
      client.getRunStatus("demo", "00000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({
      name: "AnchorClientError",
      status: 401,
      code: "unauthorized",
    });
  });

  it("parses model.yaml responses and handles 304", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = resolveFetchUrl(input);
      if (url.endsWith("/model")) {
        if (init?.headers instanceof Headers && init.headers.get("If-None-Match") === '"cached"') {
          return new Response(null, { status: 304 });
        }
        return new Response(MINIMAL_MODEL_YAML, {
          status: 200,
          headers: {
            "Content-Type": "application/yaml",
            ETag: '"abc123"',
          },
        });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });

    const client = new AnchorClient({
      baseUrl: "http://127.0.0.1:8790",
      token: "bkd_live_test",
      fetch: fetchImpl as typeof fetch,
    });

    const result = await client.getModel("demo");
    expect(result.notModified).toBe(false);
    if (result.notModified === false) {
      expect(result.model.entities).toEqual([]);
      expect(result.etag).toBe('"abc123"');
    }

    const cached = await client.getModel("demo", { ifNoneMatch: '"cached"' });
    expect(cached).toEqual({ notModified: true });
  });

  it("submitRun posts multipart data", async () => {
    const fetchImpl = createMockFetch({
      "/runs": () => jsonResponse({ runId: "00000000-0000-4000-8000-000000000099" }, 202),
    });
    const client = new AnchorClient({
      baseUrl: "http://127.0.0.1:8790",
      token: "bkd_live_test",
      fetch: fetchImpl as typeof fetch,
    });
    const result = await client.submitRun("demo", [{ filename: "a.csv", content: "x" }]);
    expect(result.runId).toBe("00000000-0000-4000-8000-000000000099");
  });

  it("covers review, audit, and config endpoints", async () => {
    const fetchImpl = createMockFetch({
      "/review": (init) => {
        if (init?.method === "POST") {
          return jsonResponse({ updated: true, staleAnswerCount: 0 });
        }
        return jsonResponse({ questions: [] });
      },
      "/audit/deletions": () => jsonResponse({ entries: [], total: 0, offset: 0, limit: 50 }),
      "/audit/ledger": () => jsonResponse({ entries: [] }),
      "/config": (init) => {
        if (init?.method === "PATCH") {
          return jsonResponse({
            config: {
              documentTypeHints: [
                {
                  match: "invoice",
                  documentType: "invoice",
                  documentTypeLabel: "Invoice",
                  confidence: 0.9,
                },
              ],
            },
          });
        }
        return jsonResponse({ config: { documentTypeHints: [] } });
      },
    });
    const client = new AnchorClient({
      baseUrl: "http://127.0.0.1:8790",
      token: "bkd_live_test",
      fetch: fetchImpl as typeof fetch,
    });

    await expect(client.getReviewQuestions("demo")).resolves.toEqual({ questions: [] });
    await expect(client.submitReview("demo", { answers: [] })).resolves.toMatchObject({
      updated: true,
    });
    await expect(client.listDeletions("demo", { limit: 10 })).resolves.toMatchObject({ total: 0 });
    await expect(client.getLedger("demo")).resolves.toMatchObject({ entries: [] });
    await expect(client.getTenantConfig("demo")).resolves.toMatchObject({ documentTypeHints: [] });
    await expect(
      client.updateTenantConfig("demo", {
        documentTypeHints: [
          {
            match: "invoice",
            documentType: "invoice",
            documentTypeLabel: "Invoice",
            confidence: 0.9,
          },
        ],
      }),
    ).resolves.toMatchObject({ documentTypeHints: [{ match: "invoice" }] });
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
        return { status: "done" as const };
      }),
    };

    const result = await waitForRun(reader, "demo", "00000000-0000-4000-8000-000000000001", {
      intervalMs: 1,
    });

    expect(result.status).toBe("done");
    expect(reader.getRunStatus).toHaveBeenCalledTimes(3);
  });

  it("returns failed terminal status", async () => {
    const reader = {
      getRunStatus: vi.fn(async () => ({ status: "failed" as const, failureMessage: "boom" })),
    };
    const result = await waitForRun(reader, "demo", "run-failed", { intervalMs: 1 });
    expect(result.status).toBe("failed");
  });

  it("throws when maxWaitMs is exceeded", async () => {
    const reader = {
      getRunStatus: vi.fn(async () => ({ status: "running" as const })),
    };
    await expect(
      waitForRun(reader, "demo", "run-slow", { intervalMs: 1, maxWaitMs: 5 }),
    ).rejects.toThrow(AnchorWaitError);
  });

  it("throws when aborted", async () => {
    const controller = new AbortController();
    const reader = {
      getRunStatus: vi.fn(async () => {
        controller.abort("user cancelled");
        return { status: "running" as const };
      }),
    };
    await expect(
      waitForRun(reader, "demo", "run-abort", {
        intervalMs: 10,
        signal: controller.signal,
      }),
    ).rejects.toThrow(AnchorWaitError);
  });
});
