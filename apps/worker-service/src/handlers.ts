import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseModelYaml } from "@trybacked/core";
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
    ModelElementNotFoundError,
    ModelNotFoundError,
    patchTenantModelElement,
} from "./model-store.js";
import { PatchModelElementSchema } from "@trybacked/core";
import {
    computeRunDurationMs,
    logRunCompleted,
    logRunFailed,
    logRunStarted,
} from "./metrics.js";
import type { PartnerRegistry } from "./partner-registry.js";
import { notifyRunCompletedWebhook } from "./webhook.js";

export interface WorkerServiceDeps {
    config: WorkerServiceConfig;
    runStore: RunStore;
    partnerRegistry: PartnerRegistry;
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
            partnerRegistry: deps.partnerRegistry,
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
            partnerRegistry: deps.partnerRegistry,
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

function readAdminListLimit(request: IncomingMessage): number {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const limitRaw = url.searchParams.get("limit");
    if (limitRaw === null || limitRaw.trim().length === 0) {
        return 20;
    }
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed)) {
        return 20;
    }
    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function readAdminPartnerFilter(request: IncomingMessage): string | undefined {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const partnerId = url.searchParams.get("partnerId");
    if (partnerId === null || partnerId.trim().length === 0) {
        return undefined;
    }
    return partnerId.trim();
}

export async function handleAdminSubmitRun(
    tenantId: string,
    partnerId: string,
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): Promise<void> {
    await handleSubmitRun(tenantId, partnerId, request, response, deps);
}

export function handleAdminGetRunStatus(
    tenantId: string,
    runId: string,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): void {
    handleGetRunStatus(tenantId, runId, response, deps);
}

export function handleAdminListRuns(
    request: IncomingMessage,
    response: ServerResponse,
    deps: WorkerServiceDeps,
): void {
    const limit = readAdminListLimit(request);
    const partnerFilter = readAdminPartnerFilter(request);
    const runs = deps.runStore.listRecent(limit, partnerFilter).map((record) => ({
        runId: record.runId,
        tenantId: record.tenantId,
        ...(record.partnerId !== undefined ? { partnerId: record.partnerId } : {}),
        status: record.status,
        startedAt: record.startedAt,
        ...(record.finishedAt !== undefined ? { finishedAt: record.finishedAt } : {}),
        durationMs: computeRunDurationMs(record.startedAt, record.finishedAt),
        ...(record.stats !== undefined ? { stats: record.stats } : {}),
        ...(record.stats?.skippedLlm !== undefined ? { skippedLlm: record.stats.skippedLlm } : {}),
        ...(record.failureMessage !== undefined ? { failureMessage: record.failureMessage } : {}),
    }));
    sendJson(response, 200, { runs });
}

export async function handleAdminPatchModelElement(
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
    const payload = PatchModelElementSchema.safeParse(parsedPayload);
    if (!payload.success) {
        sendApiError(response, 400, { error: "invalid_model_patch_payload" });
        return;
    }
    try {
        const model = await patchTenantModelElement(deps.config.dataRoot, tenantId, payload.data);
        sendJson(response, 200, { model });
    }
    catch (error) {
        if (error instanceof ModelNotFoundError) {
            sendApiError(response, 404, { error: "model_not_found" });
            return;
        }
        if (error instanceof ModelElementNotFoundError) {
            sendApiError(response, 404, { error: "model_element_not_found" });
            return;
        }
        throw error;
    }
}

export async function handleAdminGetModel(
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
    const model = parseModelYaml(modelYaml);
    sendJson(response, 200, { model });
}

export function handleAdminGetReview(
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
        entityCount: proposal.entities.length,
        relationCount: proposal.relations.length,
        ruleCount: proposal.rules.length,
        doubtCount: proposal.doubts.length,
    });
}

export function extractAdminTenantRoute(pathname: string): { tenantId: string; remainder: string } | null {
    const match = /^\/admin\/v1\/tenants\/([^/]+)(?:\/(.*))?$/.exec(pathname);
    if (match === null) {
        return null;
    }
    const tenantId = decodeURIComponent(match[1] ?? "");
    try {
        assertValidTenantId(tenantId);
    }
    catch {
        return null;
    }
    return {
        tenantId,
        remainder: match[2] ?? "",
    };
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
