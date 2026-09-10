import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    buildHealthResponse,
    computeRunDurationMs,
    isDataRootWritable,
    logRunCompleted,
    logRunFailed,
    logRunStarted,
    resetStructuredLogger,
    setStructuredLogger,
    type StructuredLogEntry,
} from "../src/metrics.js";
import { SERVICE_NAME } from "../src/config.js";

describe("structured logging", () => {
    const entries: StructuredLogEntry[] = [];

    afterEach(() => {
        resetStructuredLogger();
        entries.length = 0;
    });

    it("emits JSON lines for run lifecycle events", () => {
        setStructuredLogger({
            emit(entry) {
                entries.push(entry);
            },
        });
        logRunStarted({
            tenantId: "demo",
            runId: "run-1",
            partnerId: "default",
            fileCount: 2,
        });
        logRunCompleted({
            tenantId: "demo",
            runId: "run-1",
            partnerId: "default",
            durationMs: 1200,
            skipped: false,
            deletionEntry: {
                runId: "run-1",
                tenantId: "demo",
                deletedAt: new Date().toISOString(),
                filesDeleted: 3,
                bytesDeleted: 128,
            },
        });
        expect(entries.map((entry) => entry.event)).toEqual([
            "run.started",
            "gc.completed",
            "run.completed",
        ]);
        expect(entries[0]?.fileCount).toBe(2);
        expect(entries[2]?.durationMs).toBe(1200);
        expect(entries[2]?.skipped).toBe(false);
    });

    it("emits gc.completed and run.failed when deletion proof exists", () => {
        setStructuredLogger({
            emit(entry) {
                entries.push(entry);
            },
        });
        logRunFailed({
            tenantId: "demo",
            runId: "run-2",
            partnerId: "partner-a",
            durationMs: 400,
            failureMessage: "pipeline exploded",
            deletionEntry: {
                runId: "run-2",
                tenantId: "demo",
                deletedAt: new Date().toISOString(),
                filesDeleted: 1,
                bytesDeleted: 64,
            },
        });
        expect(entries.map((entry) => entry.event)).toEqual(["gc.completed", "run.failed"]);
        expect(entries[1]?.failureMessage).toBe("pipeline exploded");
    });

    it("computes run duration from ISO timestamps", () => {
        const durationMs = computeRunDurationMs(
            "2026-09-10T12:00:00.000Z",
            "2026-09-10T12:00:02.500Z",
        );
        expect(durationMs).toBe(2500);
    });
});

describe("health checks", () => {
    it("reports writable data root", () => {
        const dataRoot = mkdtempSync(join(tmpdir(), "worker-health-"));
        try {
            expect(isDataRootWritable(dataRoot)).toBe(true);
            const health = buildHealthResponse(SERVICE_NAME, dataRoot);
            expect(health.ok).toBe(true);
            expect(health.dataRootWritable).toBe(true);
            expect(health.service).toBe(SERVICE_NAME);
            expect(health.version).toMatch(/^\d+\.\d+\.\d+$/);
        }
        finally {
            rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it("returns ok=false when data root is not writable", () => {
        const health = buildHealthResponse(SERVICE_NAME, "/definitely-not-writable-on-mac");
        expect(health.ok).toBe(false);
        expect(health.dataRootWritable).toBe(false);
    });
});
