import {
  assertValidTenantId,
  hashContent,
  resolveTenantWorkspace,
} from "@backed/runner";
import { parseModelYaml } from "@trybacked/core";
import { PatchModelElementSchema } from "@trybacked/core";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AdminListRunsQuerySchema, ReviewSubmitSchema } from "./api-types.js";
import { parseDeletionLogQuery, queryDeletionLog, readLedgerAudit } from "./audit-export.js";
import type { WorkerServiceConfig } from "./config.js";
import { PayloadTooLargeError, readRequestBody, sendApiError, sendJson, sendYaml } from "./http.js";
import { computeRunDurationMs, logRunStarted } from "./metrics.js";
import {
  ModelElementNotFoundError,
  ModelNotFoundError,
  patchTenantModelElement,
} from "./model-store.js";
import { parseMultipartFormData } from "./multipart.js";
import type { PartnerRegistry } from "./partner-registry.js";
import {
  applyTenantReview,
  loadTenantProposal,
  ReviewNotFoundError,
  StaleReviewError,
} from "./review-store.js";
import { toRunStatusResponse, type RunStore } from "./run-store.js";
import { InvalidSubmitRunConfigError, parseSubmitRunConfig } from "./submit-run-config.js";
import type { RunExecutor } from "./run-executor.js";

export interface WorkerServiceDeps {
  config: WorkerServiceConfig;
  runStore: RunStore;
  partnerRegistry: PartnerRegistry;
  runExecutor: RunExecutor;
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
  } catch {
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

  let runConfig;
  try {
    runConfig = parseSubmitRunConfig(parsed.fields);
  } catch (error) {
    if (error instanceof InvalidSubmitRunConfigError) {
      sendApiError(response, 400, { error: "invalid_config" });
      return;
    }
    throw error;
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
  deps.runExecutor.enqueue({
    tenantId,
    runId,
    partnerId,
    files: parsed.files.map((file) => ({
      fileName: file.fileName,
      content: file.content,
    })),
    skipEmbed: deps.config.skipEmbed,
    config: runConfig,
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
  } catch {
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
  } catch (error) {
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

function parseAdminListRunsQuery(request: IncomingMessage):
  | {
      ok: true;
      query: { limit: number; partnerId?: string };
    }
  | {
      ok: false;
    } {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parsed = AdminListRunsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    partnerId: url.searchParams.get("partnerId") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false };
  }
  return {
    ok: true,
    query: {
      limit: parsed.data.limit,
      ...(parsed.data.partnerId !== undefined ? { partnerId: parsed.data.partnerId } : {}),
    },
  };
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
  const parsed = parseAdminListRunsQuery(request);
  if (!parsed.ok) {
    sendApiError(response, 400, { error: "invalid_audit_pagination" });
    return;
  }
  const { limit, partnerId: partnerFilter } = parsed.query;
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
  } catch {
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
  } catch (error) {
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

export function extractAdminTenantRoute(
  pathname: string,
): { tenantId: string; remainder: string } | null {
  const match = /^\/admin\/v1\/tenants\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (match === null) {
    return null;
  }
  const tenantId = decodeURIComponent(match[1] ?? "");
  try {
    assertValidTenantId(tenantId);
  } catch {
    return null;
  }
  return {
    tenantId,
    remainder: match[2] ?? "",
  };
}

export function extractTenantRoute(
  pathname: string,
): { tenantId: string; remainder: string } | null {
  const tenantMatch = /^\/v1\/tenants\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (tenantMatch === null) {
    return null;
  }
  const tenantId = decodeURIComponent(tenantMatch[1] ?? "");
  try {
    assertValidTenantId(tenantId);
  } catch {
    return null;
  }
  return {
    tenantId,
    remainder: tenantMatch[2] ?? "",
  };
}

export { PayloadTooLargeError };
