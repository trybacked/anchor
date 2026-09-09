import type { DeletionLogEntry, PipelineStats } from "@backed/runner";
import type { RunStatusResponse } from "./api-types.js";

export type RunStatus = "running" | "done" | "failed";

export interface StoredRun {
    runId: string;
    tenantId: string;
    status: RunStatus;
    startedAt: string;
    finishedAt?: string;
    stats?: PipelineStats;
    deletionEntry?: DeletionLogEntry;
    failureMessage?: string;
}

export function toRunStatusResponse(record: StoredRun): RunStatusResponse {
    const shared = {
        ...(record.stats !== undefined ? { stats: record.stats } : {}),
        ...(record.deletionEntry !== undefined ? { deletionEntry: record.deletionEntry } : {}),
    };
    switch (record.status) {
        case "running":
        case "done":
            return {
                status: record.status,
                ...shared,
            };
        case "failed":
            return {
                status: record.status,
                ...shared,
                ...(record.failureMessage !== undefined ? { failureMessage: record.failureMessage } : {}),
            };
        default: {
            const unhandled: never = record.status;
            throw new Error(`Unhandled run status: ${String(unhandled)}`);
        }
    }
}

export class RunStore {
    private readonly runs = new Map<string, StoredRun>();

    private key(tenantId: string, runId: string): string {
        return `${tenantId}:${runId}`;
    }

    create(tenantId: string, runId: string): StoredRun {
        const record: StoredRun = {
            runId,
            tenantId,
            status: "running",
            startedAt: new Date().toISOString(),
        };
        this.runs.set(this.key(tenantId, runId), record);
        return record;
    }

    get(tenantId: string, runId: string): StoredRun | undefined {
        return this.runs.get(this.key(tenantId, runId));
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
        return record;
    }
}
