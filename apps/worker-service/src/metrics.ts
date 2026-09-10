import { accessSync, constants, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DeletionLogEntry } from "@backed/runner";

export type StructuredLogEvent =
    | "run.started"
    | "run.completed"
    | "run.failed"
    | "gc.completed";

export interface StructuredLogEntry {
    event: StructuredLogEvent;
    ts: string;
    tenantId: string;
    runId: string;
    partnerId: string;
    durationMs?: number;
    skipped?: boolean;
    filesDeleted?: number;
    bytesDeleted?: number;
    failureMessage?: string;
    fileCount?: number;
}

export interface HealthResponse {
    ok: boolean;
    service: string;
    version: string;
    dataRootWritable: boolean;
}

export interface StructuredLogger {
    emit(entry: StructuredLogEntry): void;
}

function writeStructuredLog(entry: StructuredLogEntry): void {
    console.log(JSON.stringify(entry));
}

let logger: StructuredLogger = { emit: writeStructuredLog };

export function setStructuredLogger(customLogger: StructuredLogger): void {
    logger = customLogger;
}

export function resetStructuredLogger(): void {
    logger = { emit: writeStructuredLog };
}

let cachedVersion: string | undefined;

export function getServiceVersion(): string {
    if (cachedVersion !== undefined) {
        return cachedVersion;
    }
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const packagePath = path.join(moduleDir, "..", "package.json");
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
    cachedVersion = typeof parsed.version === "string" ? parsed.version : "0.0.0";
    return cachedVersion;
}

export function isDataRootWritable(dataRoot: string): boolean {
    try {
        mkdirSync(dataRoot, { recursive: true });
        accessSync(dataRoot, constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}

export function buildHealthResponse(serviceName: string, dataRoot: string): HealthResponse {
    const dataRootWritable = isDataRootWritable(dataRoot);
    return {
        ok: dataRootWritable,
        service: serviceName,
        version: getServiceVersion(),
        dataRootWritable,
    };
}

function emitGcCompleted(
    tenantId: string,
    runId: string,
    partnerId: string,
    deletionEntry: DeletionLogEntry,
): void {
    logger.emit({
        event: "gc.completed",
        ts: new Date().toISOString(),
        tenantId,
        runId,
        partnerId,
        filesDeleted: deletionEntry.filesDeleted,
        bytesDeleted: deletionEntry.bytesDeleted,
    });
}

export function logRunStarted(input: {
    tenantId: string;
    runId: string;
    partnerId: string;
    fileCount: number;
}): void {
    logger.emit({
        event: "run.started",
        ts: new Date().toISOString(),
        tenantId: input.tenantId,
        runId: input.runId,
        partnerId: input.partnerId,
        fileCount: input.fileCount,
    });
}

export function logRunCompleted(input: {
    tenantId: string;
    runId: string;
    partnerId: string;
    durationMs: number;
    skipped: boolean;
    deletionEntry: DeletionLogEntry;
}): void {
    emitGcCompleted(input.tenantId, input.runId, input.partnerId, input.deletionEntry);
    logger.emit({
        event: "run.completed",
        ts: new Date().toISOString(),
        tenantId: input.tenantId,
        runId: input.runId,
        partnerId: input.partnerId,
        durationMs: input.durationMs,
        skipped: input.skipped,
        filesDeleted: input.deletionEntry.filesDeleted,
        bytesDeleted: input.deletionEntry.bytesDeleted,
    });
}

export function logRunFailed(input: {
    tenantId: string;
    runId: string;
    partnerId: string;
    durationMs: number;
    failureMessage: string;
    deletionEntry?: DeletionLogEntry;
}): void {
    if (input.deletionEntry !== undefined) {
        emitGcCompleted(input.tenantId, input.runId, input.partnerId, input.deletionEntry);
    }
    logger.emit({
        event: "run.failed",
        ts: new Date().toISOString(),
        tenantId: input.tenantId,
        runId: input.runId,
        partnerId: input.partnerId,
        durationMs: input.durationMs,
        skipped: false,
        failureMessage: input.failureMessage,
        ...(input.deletionEntry !== undefined
            ? {
                filesDeleted: input.deletionEntry.filesDeleted,
                bytesDeleted: input.deletionEntry.bytesDeleted,
            }
            : {}),
    });
}

export function computeRunDurationMs(startedAt: string, finishedAt?: string): number {
    const endMs = finishedAt !== undefined ? new Date(finishedAt).getTime() : Date.now();
    return Math.max(0, endMs - new Date(startedAt).getTime());
}
