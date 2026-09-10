import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileRunStore } from "../src/run-store-fs.js";

describe("FileRunStore", () => {
    it("persists run records across store instances", async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), "run-store-fs-"));
        const first = new FileRunStore(dataRoot);
        await first.init();
        first.create("tenant-a", "run-1");
        first.complete("tenant-a", "run-1", {
            ingestMs: 1,
            documentsMs: 0,
            extractionMs: 0,
            embedMs: 0,
            profileMs: 1,
            proposalMs: 1,
            llmUsage: { inputTokens: 0, outputTokens: 0, costUsd: null },
            skippedLlm: false,
        }, {
            runId: "run-1",
            tenantId: "tenant-a",
            deletedAt: new Date().toISOString(),
            filesDeleted: 2,
            bytesDeleted: 64,
        });

        const second = new FileRunStore(dataRoot);
        const record = second.get("tenant-a", "run-1");
        expect(record?.status).toBe("done");
        expect(record?.deletionEntry?.filesDeleted).toBe(2);
    });

    it("stores deletionEntry on failed runs", async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), "run-store-fs-"));
        const store = new FileRunStore(dataRoot);
        await store.init();
        store.create("tenant-b", "run-2");
        store.fail("tenant-b", "run-2", "pipeline exploded", {
            runId: "run-2",
            tenantId: "tenant-b",
            deletedAt: new Date().toISOString(),
            filesDeleted: 1,
            bytesDeleted: 32,
        });
        const record = store.get("tenant-b", "run-2");
        expect(record?.status).toBe("failed");
        expect(record?.failureMessage).toBe("pipeline exploded");
        expect(record?.deletionEntry?.bytesDeleted).toBe(32);
    });
});
