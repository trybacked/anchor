import { createHmac, timingSafeEqual } from "node:crypto";
import type { RunCompletedWebhookPayload } from "./types.js";

export const RUN_COMPLETED_WEBHOOK_EVENT = "run.completed" as const;
export const WEBHOOK_SIGNATURE_HEADER = "X-Backed-Signature";

export function signWebhookPayload(body: string, secret: string): string {
    return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyWebhookSignature(body: string, secret: string, signature: string): boolean {
    const expected = signWebhookPayload(body, secret);
    const expectedBuffer = Buffer.from(expected, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function parseRunCompletedWebhook(body: string): RunCompletedWebhookPayload {
    const payload = JSON.parse(body) as RunCompletedWebhookPayload;
    if (payload.event !== RUN_COMPLETED_WEBHOOK_EVENT) {
        throw new Error(`Unexpected webhook event: ${String(payload.event)}`);
    }
    return payload;
}
