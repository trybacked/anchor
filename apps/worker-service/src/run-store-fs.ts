import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { DeletionLogEntry, PipelineStats } from "@backed/runner";
import type { RunStore, StoredRun } from "./run-store.js";

const StoredRunSchema = z.object({
    runId: z.string().min(1),
    tenantId: z.string().min(1),
    partnerId: z.string().min(1).optional(),
    status: z.enum(["running", "done", "failed"]),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    stats: z.custom<PipelineStats>().optional(),
    deletionEntry: z.custom<DeletionLogEntry>().optional(),
    failureMessage: z.string().optional(),
});

function parseStoredRun(raw: string): StoredRun | undefined {
    try {
        const parsed = StoredRunSchema.parse(JSON.parse(raw) as unknown);
        return {
            runId: parsed.runId,
            tenantId: parsed.tenantId,
            ...(parsed.partnerId !== undefined ? { partnerId: parsed.partnerId } : {}),
            status: parsed.status,
            startedAt: parsed.startedAt,
            ...(parsed.finishedAt !== undefined ? { finishedAt: parsed.finishedAt } : {}),
            ...(parsed.stats !== undefined ? { stats: parsed.stats } : {}),
            ...(parsed.deletionEntry !== undefined ? { deletionEntry: parsed.deletionEntry } : {}),
            ...(parsed.failureMessage !== undefined ? { failureMessage: parsed.failureMessage } : {}),
        };
    }
    catch {
        return undefined;
    }
}

export class FileRunStore implements RunStore {
    private readonly runsRoot: string;

    constructor(dataRoot: string) {
        this.runsRoot = path.join(path.resolve(dataRoot), ".runs");
    }

    async init(): Promise<void> {
        await mkdir(this.runsRoot, { recursive: true });
    }

    private runPath(tenantId: string, runId: string): string {
        return path.join(this.runsRoot, tenantId, `${runId}.json`);
    }

    private readRunSync(filePath: string): StoredRun | undefined {
        if (!existsSync(filePath)) {
            return undefined;
        }
        return parseStoredRun(readFileSync(filePath, "utf8"));
    }

    private writeRunSync(record: StoredRun): void {
        const filePath = this.runPath(record.tenantId, record.runId);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
    }

    create(tenantId: string, runId: string, partnerId?: string): StoredRun {
        const record: StoredRun = {
            runId,
            tenantId,
            status: "running",
            startedAt: new Date().toISOString(),
            ...(partnerId !== undefined ? { partnerId } : {}),
        };
        this.writeRunSync(record);
        return record;
    }

    get(tenantId: string, runId: string): StoredRun | undefined {
        return this.readRunSync(this.runPath(tenantId, runId));
    }

    complete(tenantId: string, runId: string, stats: PipelineStats, deletionEntry: DeletionLogEntry): StoredRun | undefined {
        const record = this.get(tenantId, runId);
        if (record === undefined) {
            return undefined;
        }
        record.status = "done";
        record.finishedAt = new Date().toISOString();
        record.stats = stats;
        record.deletionEntry = deletionEntry;
        this.writeRunSync(record);
        return record;
    }

    fail(tenantId: string, runId: string, failureMessage: string, deletionEntry?: DeletionLogEntry): StoredRun | undefined {
        const record = this.get(tenantId, runId);
        if (record === undefined) {
            return undefined;
        }
        record.status = "failed";
        record.finishedAt = new Date().toISOString();
        record.failureMessage = failureMessage;
        if (deletionEntry !== undefined) {
            record.deletionEntry = deletionEntry;
        }
        this.writeRunSync(record);
        return record;
    }
}

