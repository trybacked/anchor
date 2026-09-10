import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
    assertValidTenantId,
    hashContent,
    resolveTenantWorkspace,
    runTenantPipeline,
    TenantPipelineError,
} from "@backed/runner";
import { ReviewSubmitSchema } from "./api-types.js";
import type { WorkerServiceConfig } from "./config.js";
import { PayloadTooLargeError, readRequestBody, sendApiError, sendJson, sendYaml } from "./http.js";
import { parseMultipartFormData } from "./multipart.js";
import { toRunStatusResponse, type RunStore } from "./run-store.js";
import {
    parseDeletionLogQuery,
    queryDeletionLog,
    readLedgerAudit,
} from "./audit-export.js";
import {
    applyTenantReview,
    loadTenantProposal,
    ReviewNotFoundError,
    StaleReviewError,
} from "./review-store.js";
import {
    computeRunDurationMs,
    logRunCompleted,
    logRunFailed,
    logRunStarted,
} from "./metrics.js";
import { notifyRunCompletedWebhook } from "./webhook.js";

export interface WorkerServiceDeps {
    config: WorkerServiceConfig;
    runStore: RunStore;
    webhookFetch?: typeof fetch;
}

export async function handleSubmitRun(
    tenantId: string,
    partnerId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    const body = await readRequestBody(request, deps.config.maxUploadBytes);
    let parsed;
    try {
        parsed = parseMultipartFormData(body, request.headers["content-type"]);
    }
    catch {
        sendApiError(response, 400, { error: "invalid_multipart" });
        return;
    }
    if (parsed.files.length === 0) {
        sendApiError(response, 400, { error: "no_files_uploaded" });
        return;
    }
    if (parsed.files.length > deps.config.maxUploadFiles) {
        sendApiError(response, 413, { error: "too_many_files", maxFiles: deps.config.maxUploadFiles });
        return;
    }
    const runId = randomUUID();
    deps.runStore.create(tenantId, runId, partnerId);
    logRunStarted({
        tenantId,
        runId,
        partnerId,
        fileCount: parsed.files.length,
    });
    sendJson(response, 202, { runId });
    void runTenantPipeline({
        dataRoot: deps.config.dataRoot,
        tenantId,
        runId,
        files: parsed.files.map((file) => ({
            fileName: file.fileName,
            content: file.content,
        })),
        skipEmbed: deps.config.skipEmbed,
    }).then((result) => {
        const record = deps.runStore.complete(tenantId, runId, result.stats, result.deletionEntry);
        logRunCompleted({
            tenantId,
            runId,
            partnerId,
            durationMs: computeRunDurationMs(
                record?.startedAt ?? new Date().toISOString(),
                record?.finishedAt,
            ),
            skipped: result.skipped,
            deletionEntry: result.deletionEntry,
        });
        void notifyRunCompletedWebhook({
            config: deps.config,
            partnerId,
            tenantId,
            runId,
            status: "done",
            skipped: result.skipped,
            deletionEntry: result.deletionEntry,
            ...(deps.webhookFetch !== undefined ? { fetchImpl: deps.webhookFetch } : {}),
        });
    }).catch((error: unknown) => {
        const deletionEntry = error instanceof TenantPipelineError ? error.deletionEntry : undefined;
        const failureMessage = error instanceof Error ? error.message : String(error);
        const existing = deps.runStore.get(tenantId, runId);
        const record = deps.runStore.fail(tenantId, runId, failureMessage, deletionEntry);
        logRunFailed({
            tenantId,
            runId,
            partnerId,
            durationMs: computeRunDurationMs(
                record?.startedAt ?? existing?.startedAt ?? new Date().toISOString(),
                record?.finishedAt,
            ),
            failureMessage,
            ...(deletionEntry !== undefined ? { deletionEntry } : {}),
        });
        void notifyRunCompletedWebhook({
            config: deps.config,
            partnerId,
            tenantId,
            runId,
            status: "failed",
            skipped: false,
            ...(deletionEntry !== undefined ? { deletionEntry } : {}),
            ...(deps.webhookFetch !== undefined ? { fetchImpl: deps.webhookFetch } : {}),
        });
    });
}

export async function handleGetModel(
    tenantId: string,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    const workspace = resolveTenantWorkspace(deps.config.dataRoot, tenantId);
    if (!existsSync(workspace.paths.modelPath)) {
        sendApiError(response, 404, { error: "model_not_found" });
        return;
    }
    const modelYaml = await readFile(workspace.paths.modelPath, "utf8");
    const etag = `"${hashContent(modelYaml).slice(0, 16)}"`;
    sendYaml(response, 200, modelYaml, { ETag: etag });
}

export function handleGetRunStatus(
    tenantId: string,
    runId: string,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): void {
    const record = deps.runStore.get(tenantId, runId);
    if (record === undefined) {
        sendApiError(response, 404, { error: "run_not_found" });
        return;
    }
    sendJson(response, 200, toRunStatusResponse(record));
}

export function handleGetReview(
    tenantId: string,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): void {
    const proposal = loadTenantProposal(deps.config.dataRoot, tenantId);
    if (proposal === null) {
        sendApiError(response, 404, { error: "review_not_available" });
        return;
    }
    sendJson(response, 200, {
        runId: proposal.runId,
        questions: proposal.questions,
    });
}

export async function handlePostReview(
    tenantId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    const body = await readRequestBody(request, deps.config.maxUploadBytes);
    let parsedPayload: unknown;
    try {
        parsedPayload = JSON.parse(body.toString("utf8"));
    }
    catch {
        sendApiError(response, 400, { error: "invalid_json" });
        return;
    }
    const payload = ReviewSubmitSchema.safeParse(parsedPayload);
    if (!payload.success) {
        sendApiError(response, 400, { error: "invalid_review_payload" });
        return;
    }
    try {
        const result = await applyTenantReview(deps.config.dataRoot, tenantId, payload.data.answers);
        sendJson(response, 200, {
            updated: true,
            staleAnswerCount: result.staleAnswerCount,
        });
    }
    catch (error) {
        if (error instanceof ReviewNotFoundError) {
            sendApiError(response, 404, { error: "review_not_available" });
            return;
        }
        if (error instanceof StaleReviewError) {
            sendApiError(response, 409, {
                error: "stale_review_answers",
                staleAnswerCount: error.staleAnswerCount,
            });
            return;
        }
        throw error;
    }
}

export async function handleGetAuditDeletions(
    tenantId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const parsed = parseDeletionLogQuery(url.searchParams);
    if (!parsed.ok) {
        sendApiError(response, 400, {
            error: parsed.error === "invalid_date" ? "invalid_audit_date" : "invalid_audit_pagination",
        });
        return;
    }
    const workspace = resolveTenantWorkspace(deps.config.dataRoot, tenantId);
    const result = await queryDeletionLog(workspace.paths.deletionLogPath, parsed.query);
    sendJson(response, 200, result);
}

export async function handleGetAuditLedger(
    tenantId: string,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    const workspace = resolveTenantWorkspace(deps.config.dataRoot, tenantId);
    const result = await readLedgerAudit(workspace.paths.ledgerPath);
    sendJson(response, 200, result);
}

export function extractTenantRoute(pathname: string): { tenantId: string; remainder: string } | null {
    const tenantMatch = /^\/v1\/tenants\/([^/]+)(?:\/(.*))?$/.exec(pathname);
    if (tenantMatch === null) {
        return null;
    }
    const tenantId = decodeURIComponent(tenantMatch[1] ?? "");
    try {
        assertValidTenantId(tenantId);
    }
    catch {
        return null;
    }
    return {
        tenantId,
        remainder: tenantMatch[2] ?? "",
    };
}

export { PayloadTooLargeError };
