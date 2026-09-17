import { AnchorWebhookError } from "../errors.js";
import type { DeletionLogEntry, RunCompletedWebhookPayload } from "../types.js";
import { RUN_COMPLETED_WEBHOOK_EVENT } from "./constants.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunStatus(value: unknown): value is "done" | "failed" {
  return value === "done" || value === "failed";
}

function parseDeletionEntry(value: unknown): DeletionLogEntry {
  if (!isRecord(value)) {
    throw new AnchorWebhookError("Webhook payload has an invalid deletionEntry.");
  }
  if (
    typeof value.runId !== "string" ||
    typeof value.tenantId !== "string" ||
    typeof value.deletedAt !== "string" ||
    typeof value.filesDeleted !== "number" ||
    typeof value.bytesDeleted !== "number"
  ) {
    throw new AnchorWebhookError("Webhook payload has an invalid deletionEntry.");
  }
  return {
    runId: value.runId,
    tenantId: value.tenantId,
    deletedAt: value.deletedAt,
    filesDeleted: value.filesDeleted,
    bytesDeleted: value.bytesDeleted,
  };
}

/**
 * Parses and validates a `run.completed` webhook JSON body.
 *
 * @throws {@link AnchorWebhookError} When JSON is invalid or required fields are missing.
 */
export function parseRunCompletedWebhook(body: string): RunCompletedWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (cause) {
    throw new AnchorWebhookError("Webhook body is not valid JSON.", { cause });
  }

  if (!isRecord(parsed)) {
    throw new AnchorWebhookError("Webhook payload must be a JSON object.");
  }

  if (parsed.event !== RUN_COMPLETED_WEBHOOK_EVENT) {
    throw new AnchorWebhookError(`Unexpected webhook event: ${String(parsed.event)}`);
  }
  if (typeof parsed.tenantId !== "string" || parsed.tenantId.length === 0) {
    throw new AnchorWebhookError("Webhook payload is missing tenantId.");
  }
  if (typeof parsed.runId !== "string" || parsed.runId.length === 0) {
    throw new AnchorWebhookError("Webhook payload is missing runId.");
  }
  if (!isRunStatus(parsed.status)) {
    throw new AnchorWebhookError("Webhook payload has an invalid status.");
  }
  if (typeof parsed.skipped !== "boolean") {
    throw new AnchorWebhookError("Webhook payload is missing skipped.");
  }

  return {
    event: RUN_COMPLETED_WEBHOOK_EVENT,
    tenantId: parsed.tenantId,
    runId: parsed.runId,
    status: parsed.status,
    skipped: parsed.skipped,
    ...(parsed.deletionEntry !== undefined
      ? { deletionEntry: parseDeletionEntry(parsed.deletionEntry) }
      : {}),
    ...(typeof parsed.modelEtag === "string" ? { modelEtag: parsed.modelEtag } : {}),
  };
}
