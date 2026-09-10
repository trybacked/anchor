import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { DeletionLogEntry } from "@backed/runner";
import { hashContent, resolveTenantWorkspace } from "@backed/runner";
import type { PartnerConfig, WorkerServiceConfig } from "./config.js";

export const RUN_COMPLETED_WEBHOOK_EVENT = "run.completed" as const;
export const WEBHOOK_SIGNATURE_HEADER = "X-Backed-Signature";
export const WEBHOOK_MAX_ATTEMPTS = 3;
export const WEBHOOK_RETRY_BASE_MS = 100;

export interface RunCompletedWebhookPayload {
    event: typeof RUN_COMPLETED_WEBHOOK_EVENT;
    tenantId: string;
    runId: string;
    status: "done" | "failed";
    skipped: boolean;
    deletionEntry?: DeletionLogEntry;
    modelEtag?: string;
}

export interface WebhookDeliveryOptions {
    url: string;
    secret: string;
    payload: RunCompletedWebhookPayload;
    fetchImpl?: typeof fetch;
    onAttemptFailure?: (attempt: number, error: unknown) => void;
}

export function signWebhookPayload(body: string, secret: string): string {
    return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function findPartnerConfig(config: WorkerServiceConfig, partnerId: string): PartnerConfig | undefined {
    if (partnerId === "default") {
        return undefined;
    }
    return config.partners.find((partner) => partner.partnerId === partnerId);
}

export function resolveRunCompletedWebhook(
    config: WorkerServiceConfig,
    partnerId: string,
): { url: string; secret: string } | null {
    const partner = findPartnerConfig(config, partnerId);
    if (partner === undefined) {
        return null;
    }
    const url = partner.webhooks?.runCompleted?.trim();
    if (url === undefined || url.length === 0) {
        return null;
    }
    const secret = partner.webhookSecret?.trim() || partner.token;
    return { url, secret };
}

export async function readModelEtag(dataRoot: string, tenantId: string): Promise<string | undefined> {
    const workspace = resolveTenantWorkspace(dataRoot, tenantId);
    if (!existsSync(workspace.paths.modelPath)) {
        return undefined;
    }
    const modelYaml = await readFile(workspace.paths.modelPath, "utf8");
    return `"${hashContent(modelYaml).slice(0, 16)}"`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function deliverRunCompletedWebhook(options: WebhookDeliveryOptions): Promise<boolean> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const body = JSON.stringify(options.payload);
    const signature = signWebhookPayload(body, options.secret);
    for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetchImpl(options.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [WEBHOOK_SIGNATURE_HEADER]: signature,
                },
                body,
            });
            if (response.ok) {
                return true;
            }
            options.onAttemptFailure?.(attempt, new Error(`Webhook returned ${String(response.status)}`));
        }
        catch (error) {
            options.onAttemptFailure?.(attempt, error);
        }
        if (attempt < WEBHOOK_MAX_ATTEMPTS) {
            await sleep(WEBHOOK_RETRY_BASE_MS * (2 ** (attempt - 1)));
        }
    }
    return false;
}

export async function notifyRunCompletedWebhook(input: {
    config: WorkerServiceConfig;
    partnerId: string;
    tenantId: string;
    runId: string;
    status: "done" | "failed";
    skipped: boolean;
    deletionEntry?: DeletionLogEntry;
    fetchImpl?: typeof fetch;
    onAttemptFailure?: (attempt: number, error: unknown) => void;
}): Promise<void> {
    const target = resolveRunCompletedWebhook(input.config, input.partnerId);
    if (target === null) {
        return;
    }
    const modelEtag = await readModelEtag(input.config.dataRoot, input.tenantId);
    const payload: RunCompletedWebhookPayload = {
        event: RUN_COMPLETED_WEBHOOK_EVENT,
        tenantId: input.tenantId,
        runId: input.runId,
        status: input.status,
        skipped: input.skipped,
        ...(input.deletionEntry !== undefined ? { deletionEntry: input.deletionEntry } : {}),
        ...(modelEtag !== undefined ? { modelEtag } : {}),
    };
    void deliverRunCompletedWebhook({
        url: target.url,
        secret: target.secret,
        payload,
        ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.onAttemptFailure !== undefined ? { onAttemptFailure: input.onAttemptFailure } : {}),
    });
}
