import type { components } from "./generated/openapi.js";

export type { components, paths } from "./generated/openapi.js";

export type ApiError = components["schemas"]["ApiError"];
export type HealthResponse = components["schemas"]["HealthResponse"];
export type SubmitRunResponse = components["schemas"]["SubmitRunResponse"];
export type RunStatus = components["schemas"]["RunStatus"];
export type PipelineStats = components["schemas"]["PipelineStats"];
export type DeletionLogEntry = components["schemas"]["DeletionLogEntry"];
export type RunStatusResponse = components["schemas"]["RunStatusResponse"];
export type ReviewQuestion = components["schemas"]["ReviewQuestion"];
export type ReviewQuestionsResponse = components["schemas"]["ReviewQuestionsResponse"];
export type ReviewAnswer = components["schemas"]["ReviewAnswer"];
export type ReviewSubmitRequest = components["schemas"]["ReviewSubmitRequest"];
export type ReviewSubmitResponse = components["schemas"]["ReviewSubmitResponse"];
export type PaginatedDeletionsResponse = components["schemas"]["PaginatedDeletionsResponse"];
export type LedgerAuditResponse = components["schemas"]["LedgerAuditResponse"];
export type RunCompletedWebhookPayload = components["schemas"]["RunCompletedWebhookPayload"];

export interface ListDeletionsQuery {
    since?: string;
    until?: string;
    offset?: number;
    limit?: number;
}

export type GetModelResult =
    | { notModified: true }
    | {
          notModified?: false;
          model: import("@trybacked/core").SemanticModel;
          etag: string | undefined;
          yaml: string;
      };
