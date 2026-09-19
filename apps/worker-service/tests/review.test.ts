import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_ARTIFACTS } from "@trybacked/core";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_MAX_UPLOAD_FILES,
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";
import { DEFAULT_HOST, type WorkerServiceConfig } from "../src/config.js";
import { MemoryRunStore } from "../src/run-store.js";
import { startWorkerService } from "../src/server.js";

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
    maxConcurrentRuns: 2,
    shutdownDrainMs: 5_000,
  };
}

function authHeaders(token = "test-token"): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

describe("worker-service review routes", () => {
  let dataRoot: string;
  let close: () => Promise<void>;
  let baseUrl: string;
  const tenantId = "demo";

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), "worker-review-"));
    const persistDir = join(dataRoot, "tenants", tenantId, "persist");
    await mkdir(persistDir, { recursive: true });
    await writeFile(
      join(persistDir, RUN_ARTIFACTS.proposal),
      `${JSON.stringify(
        {
          runId: "run-review-1",
          generatedAt: "2026-01-01T00:00:00.000Z",
          entities: [
            {
              id: "customer",
              name: "Customer",
              sourceTable: "customers",
              status: "proposed",
              confidence: 0.99,
              provenance: { table: "customers", evidence: "test" },
              properties: [],
            },
          ],
          relations: [],
          rules: [],
          doubts: [],
          questions: [
            {
              id: "q-entity-customer",
              kind: "entity",
              targetId: "customer",
              question: "Confirm customer entity?",
              impact: 1,
              uncertainty: 0.2,
              risk: 0.2,
              evidence: { title: "Evidence", columns: ["id"], rows: [["1"]] },
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const service = await startWorkerService({
      config: createTestConfig(dataRoot),
      runStore: new MemoryRunStore(),
    });
    baseUrl = service.url;
    close = service.close;
  });

  afterEach(async () => {
    await close();
  });

  it("returns review questions for an available proposal", async () => {
    const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/review`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { runId: string; questions: unknown[] };
    expect(payload.runId).toBe("run-review-1");
    expect(payload.questions).toHaveLength(1);
  });

  it("accepts valid review answers", async () => {
    const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/review`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            questionId: "q-entity-customer",
            decision: "yes",
          },
        ],
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updated: true,
      staleAnswerCount: 0,
    });
  });

  it("rejects invalid review payloads", async () => {
    const invalidJson = await fetch(`${baseUrl}/v1/tenants/${tenantId}/review`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: "invalid_json" });

    const invalidShape = await fetch(`${baseUrl}/v1/tenants/${tenantId}/review`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answers: "not-an-array" }),
    });
    expect(invalidShape.status).toBe(400);
    expect(await invalidShape.json()).toEqual({ error: "invalid_review_payload" });
  });

  it("returns review_not_available when proposal is missing", async () => {
    const response = await fetch(`${baseUrl}/v1/tenants/empty/review`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "review_not_available" });
  });
});
