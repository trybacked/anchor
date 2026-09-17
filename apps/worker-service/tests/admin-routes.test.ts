import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_MAX_UPLOAD_FILES,
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

function createTestConfig(
  dataRoot: string,
  internalSecret = "internal-secret",
): WorkerServiceConfig {
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
    controlPlane: {
      url: "http://127.0.0.1:9999",
      internalSecret,
    },
  };
}

describe("worker-service admin routes", () => {
  let dataRoot: string;
  let close: () => Promise<void>;
  let baseUrl: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), "worker-admin-"));
    const runStore = new MemoryRunStore();
    runStore.create("demo", "run-1", "partner-a");
    runStore.complete(
      "demo",
      "run-1",
      {
        ingestMs: 1,
        documentsMs: 1,
        extractionMs: 1,
        embedMs: 0,
        profileMs: 1,
        proposalMs: 1,
        llmUsage: { inputTokens: 0, outputTokens: 0, costUsd: null },
        skippedLlm: true,
      },
      {
        runId: "run-1",
        tenantId: "demo",
        deletedAt: new Date().toISOString(),
        filesDeleted: 1,
        bytesDeleted: 10,
      },
    );
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

  it("requires internal auth for admin run listing", async () => {
    const unauthorized = await fetch(`${baseUrl}/admin/v1/runs`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/admin/v1/runs?limit=10`, {
      headers: { Authorization: "Bearer internal-secret" },
    });
    expect(authorized.status).toBe(200);
    const payload = (await authorized.json()) as { runs: Array<{ runId: string }> };
    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.runId).toBe("run-1");
  });

  it("validates admin list query parameters", async () => {
    const invalidLimit = await fetch(`${baseUrl}/admin/v1/runs?limit=0`, {
      headers: { Authorization: "Bearer internal-secret" },
    });
    expect(invalidLimit.status).toBe(400);
    expect(await invalidLimit.json()).toEqual({ error: "invalid_audit_pagination" });
  });
});
