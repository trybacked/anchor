import { ReviewAnswerSchema } from "@backed/core";
import type { DeletionLogEntry, PipelineStats } from "@backed/runner";
import { z } from "zod";
import type { RunStatus } from "./run-store.js";

export type ApiErrorResponse =
    | { error: "unauthorized" }
    | { error: "forbidden" }
    | { error: "rate_limit_exceeded" }
    | { error: "invalid_multipart" }
    | { error: "no_files_uploaded" }
    | { error: "too_many_files"; maxFiles: number }
    | { error: "payload_too_large"; maxBytes: number }
    | { error: "model_not_found" }
    | { error: "run_not_found" }
    | { error: "review_not_available" }
    | { error: "invalid_json" }
    | { error: "invalid_review_payload" }
    | { error: "stale_review_answers"; staleAnswerCount: number }
    | { error: "invalid_tenant_id" }
    | { error: "invalid_audit_date" }
    | { error: "invalid_audit_pagination" }
    | { error: "not_found" }
    | { error: "internal_error"; message: string };

export interface RunStatusResponse {
    status: RunStatus;
    stats?: PipelineStats;
    deletionEntry?: DeletionLogEntry;
    failureMessage?: string;
}

export const ReviewSubmitSchema = z.object({
    answers: z.array(ReviewAnswerSchema),
});

export type ReviewSubmitPayload = z.infer<typeof ReviewSubmitSchema>;
