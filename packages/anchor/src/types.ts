import type { SemanticModel } from "@trybacked/core";
import type { components } from "./generated/openapi.js";

export type { components, paths } from "./generated/openapi.js";

/** Standard API error body returned by the Anchor worker. */
export type ApiError = components["schemas"]["ApiError"];
/** Health check response from `GET /health`. */
export type HealthResponse = components["schemas"]["HealthResponse"];
/** Response from submitting a new pipeline run. */
export type SubmitRunResponse = components["schemas"]["SubmitRunResponse"];
/** Pipeline run lifecycle status. */
export type RunStatus = components["schemas"]["RunStatus"];
/** Aggregate pipeline statistics for a completed run. */
export type PipelineStats = components["schemas"]["PipelineStats"];
/** Audit log entry describing a model deletion. */
export type DeletionLogEntry = components["schemas"]["DeletionLogEntry"];
/** Current status payload for a pipeline run. */
export type RunStatusResponse = components["schemas"]["RunStatusResponse"];
/** Human-in-the-loop review question. */
export type ReviewQuestion = components["schemas"]["ReviewQuestion"];
/** Active review questions for a tenant. */
export type ReviewQuestionsResponse = components["schemas"]["ReviewQuestionsResponse"];
/** Answer submitted for a review question. */
export type ReviewAnswer = components["schemas"]["ReviewAnswer"];
/** Request body for submitting review answers. */
export type ReviewSubmitRequest = components["schemas"]["ReviewSubmitRequest"];
/** Response after submitting review answers. */
export type ReviewSubmitResponse = components["schemas"]["ReviewSubmitResponse"];
/** Paginated deletion audit log. */
export type PaginatedDeletionsResponse = components["schemas"]["PaginatedDeletionsResponse"];
/** Ledger audit snapshot for a tenant. */
export type LedgerAuditResponse = components["schemas"]["LedgerAuditResponse"];
/** Webhook payload for the `run.completed` event. */
export type RunCompletedWebhookPayload = components["schemas"]["RunCompletedWebhookPayload"];
/** Document type hint used during ingestion. */
export type DocumentTypeHint = components["schemas"]["DocumentTypeHint"];
/** Tenant pipeline configuration. */
export type TenantPipelineConfig = components["schemas"]["TenantPipelineConfig"];
/** Partial update to tenant pipeline configuration. */
export type TenantPipelineConfigPatch = components["schemas"]["TenantPipelineConfigPatch"];
/** API wrapper containing tenant pipeline configuration. */
export type TenantPipelineConfigResponse = components["schemas"]["TenantPipelineConfigResponse"];

export type { DocumentTypeHintConfig } from "@trybacked/core";

/** Query parameters for listing deletion audit entries. */
export interface ListDeletionsQuery {
  since?: string;
  until?: string;
  offset?: number;
  limit?: number;
}

/**
 * Result of {@link AnchorClient.getModel}.
 *
 * When the server responds with `304 Not Modified`, only `{ notModified: true }` is returned.
 * Otherwise `notModified: false` is set explicitly for discriminated narrowing.
 */
export type GetModelResult =
  | { notModified: true }
  | {
      notModified: false;
      model: SemanticModel;
      etag: string | undefined;
      yaml: string;
    };

/** Optional per-request settings shared across client methods. */
export interface RequestOptions {
  /** Aborts the in-flight request when triggered. */
  signal?: AbortSignal;
}
