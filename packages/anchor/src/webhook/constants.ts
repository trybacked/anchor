/** Webhook event name emitted when a pipeline run completes. */
export const RUN_COMPLETED_WEBHOOK_EVENT = "run.completed" as const;

/** HTTP header carrying the HMAC signature for webhook payloads. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Backed-Signature";
