import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SHUTDOWN_DRAIN_MS, type WorkerServiceConfig } from "../src/config.js";
import { createRunExecutor, ORPHANED_RUN_FAILURE_MESSAGE } from "../src/run-executor.js";
import { FileRunStore } from "../src/run-store-fs.js";
import { MemoryRunStore } from "../src/run-store.js";

function createExecutorConfig(dataRoot: string): WorkerServiceConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    dataRoot,
    authToken: "token",
    partners: [],
    maxUploadBytes: 1024,
    maxUploadFiles: 1,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 100,
    skipEmbed: true,
    maxConcurrentRuns: 1,
    shutdownDrainMs: DEFAULT_SHUTDOWN_DRAIN_MS,
  };
}

describe("createRunExecutor", () => {
  it("recovers orphaned running records on startup", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "run-executor-orphan-"));
    const store = new FileRunStore(dataRoot);
    await store.init();
    store.create("tenant-a", "run-stale", "partner-1");

    const executor = createRunExecutor({
      config: createExecutorConfig(dataRoot),
      runStore: store,
      partnerRegistry: { resolveToken: async () => null } as never,
    });
    expect(executor.recoverOrphanedRuns()).toBe(1);

    const record = store.get("tenant-a", "run-stale");
    expect(record?.status).toBe("failed");
    expect(record?.failureMessage).toBe(ORPHANED_RUN_FAILURE_MESSAGE);
  });

  it("limits concurrent pipeline executions", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "run-executor-cap-"));
    const store = new MemoryRunStore();
    let inFlight = 0;
    let maxObserved = 0;
    const runPipeline = vi.fn(async () => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      inFlight -= 1;
      return {
        runId: "run-1",
        tenantId: "tenant-a",
        skipped: false,
        modelPath: "/tmp/model.yaml",
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
          runId: "run-1",
          tenantId: "tenant-a",
          deletedAt: new Date().toISOString(),
          filesDeleted: 0,
          bytesDeleted: 0,
        },
      };
    });

    const executor = createRunExecutor({
      config: { ...createExecutorConfig(dataRoot), maxConcurrentRuns: 1 },
      runStore: store,
      partnerRegistry: { resolveToken: async () => null } as never,
      runPipeline,
    });

    for (let index = 0; index < 3; index += 1) {
      const runId = `run-${String(index)}`;
      store.create("tenant-a", runId, "partner-1");
      executor.enqueue({
        tenantId: "tenant-a",
        runId,
        partnerId: undefined,
        files: [{ fileName: "a.txt", content: Buffer.from("x") }],
        config: undefined,
        skipEmbed: true,
      });
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(maxObserved).toBe(1);
    expect(runPipeline).toHaveBeenCalledTimes(3);
  });
});
