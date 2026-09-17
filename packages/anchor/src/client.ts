import { parseModelYaml } from "@trybacked/core";
import createClient from "openapi-fetch";
import { AnchorClientError, AnchorValidationError, assertApiSuccess } from "./errors.js";
import type { paths } from "./generated/openapi.js";
import {
  buildAuthHeaders,
  createRobustFetch,
  stripTrailingSlash,
  tenantPath,
  type RetryOptions,
} from "./http.js";
import type {
  GetModelResult,
  HealthResponse,
  LedgerAuditResponse,
  ListDeletionsQuery,
  PaginatedDeletionsResponse,
  RequestOptions,
  ReviewQuestionsResponse,
  ReviewSubmitRequest,
  ReviewSubmitResponse,
  RunStatusResponse,
  SubmitRunResponse,
  TenantPipelineConfig,
  TenantPipelineConfigPatch,
} from "./types.js";
import { buildRunUploadFormData, type RunUploadInput, type SubmitRunConfig } from "./upload.js";
import { waitForRun, type WaitForRunOptions } from "./wait-for-run.js";

/** Options for {@link AnchorClient.submitRun}. */
export interface SubmitRunOptions extends RequestOptions {
  config?: SubmitRunConfig;
}

/** Options for {@link AnchorClient.getModel}. */
export interface GetModelOptions extends RequestOptions {
  /** When set, sent as `If-None-Match`; a `304` response yields `{ notModified: true }`. */
  ifNoneMatch?: string;
}

/**
 * Configuration for {@link AnchorClient} and {@link createAnchorClient}.
 */
export interface AnchorClientOptions {
  /** Base URL of the Anchor worker API (must be non-empty). */
  baseUrl: string;
  /** Bearer token for tenant-scoped routes (must be non-empty). */
  token: string;
  /** Custom fetch implementation; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Default per-request timeout in milliseconds. Defaults to `30_000`. */
  timeoutMs?: number;
  /** Retry policy for transient 5xx/network failures; `false` disables retries (default). */
  retry?: RetryOptions | false;
}

function assertNonEmpty(value: string, field: "baseUrl" | "token"): void {
  if (value.trim().length === 0) {
    throw new AnchorValidationError(`${field} must be a non-empty string.`);
  }
}

function fetchInit(options: RequestOptions): Pick<RequestInit, "signal"> {
  return options.signal !== undefined ? { signal: options.signal } : {};
}

/**
 * TypeScript client for the Anchor worker HTTP API.
 */
export class AnchorClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;
  private readonly api: ReturnType<typeof createClient<paths>>;

  /**
   * @param options - Client configuration.
   * @throws {@link AnchorValidationError} When `baseUrl` or `token` is empty.
   */
  constructor(options: AnchorClientOptions) {
    assertNonEmpty(options.baseUrl, "baseUrl");
    assertNonEmpty(options.token, "token");

    this.baseUrl = stripTrailingSlash(options.baseUrl);
    this.token = options.token;
    const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.fetchImpl = createRobustFetch(baseFetch, {
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
    });
    this.extraHeaders = options.headers ?? {};
    this.api = createClient<paths>({
      baseUrl: this.baseUrl,
      fetch: this.fetchImpl,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...this.extraHeaders,
      },
    });
  }

  /**
   * Checks worker health (`GET /health`).
   */
  async health(options: RequestOptions = {}): Promise<HealthResponse> {
    const { data, error, response } = await this.api.GET("/health", fetchInit(options));
    return assertApiSuccess(data, error, response);
  }

  /**
   * Submits files for a new pipeline run (`POST /v1/tenants/{tenantId}/runs`).
   */
  async submitRun(
    tenantId: string,
    files: readonly RunUploadInput[],
    options: SubmitRunOptions = {},
  ): Promise<SubmitRunResponse> {
    const body = buildRunUploadFormData(files, options.config);
    const { data, error, response } = await this.api.POST("/v1/tenants/{tenantId}/runs", {
      params: { path: { tenantId } },
      // FormData is valid at runtime; OpenAPI types model multipart fields as strings.
      body: body as never,
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Fetches the current status of a pipeline run.
   */
  async getRunStatus(
    tenantId: string,
    runId: string,
    options: RequestOptions = {},
  ): Promise<RunStatusResponse> {
    const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/runs/{runId}", {
      params: { path: { tenantId, runId } },
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Downloads the tenant semantic model as YAML.
   *
   * When `ifNoneMatch` matches the current ETag, returns `{ notModified: true }` without a body.
   * Otherwise returns `{ notModified: false, model, etag, yaml }`.
   */
  async getModel(tenantId: string, options: GetModelOptions = {}): Promise<GetModelResult> {
    const headers = buildAuthHeaders(this.token, this.extraHeaders);
    if (options.ifNoneMatch !== undefined) {
      headers.set("If-None-Match", options.ifNoneMatch);
    }

    const response = await this.fetchImpl(tenantPath(this.baseUrl, tenantId, "/model"), {
      method: "GET",
      headers,
      ...fetchInit(options),
    });

    if (response.status === 304) {
      return { notModified: true };
    }

    if (!response.ok) {
      throw await AnchorClientError.fromResponse(response);
    }

    const yaml = await response.text();
    const etag = response.headers.get("ETag") ?? undefined;
    return {
      notModified: false,
      model: parseModelYaml(yaml),
      etag,
      yaml,
    };
  }

  /**
   * Lists active human-in-the-loop review questions for a tenant.
   */
  async getReviewQuestions(
    tenantId: string,
    options: RequestOptions = {},
  ): Promise<ReviewQuestionsResponse> {
    const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/review", {
      params: { path: { tenantId } },
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Submits answers for the tenant review workflow.
   */
  async submitReview(
    tenantId: string,
    request: ReviewSubmitRequest,
    options: RequestOptions = {},
  ): Promise<ReviewSubmitResponse> {
    const { data, error, response } = await this.api.POST("/v1/tenants/{tenantId}/review", {
      params: { path: { tenantId } },
      body: request,
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Lists deletion audit log entries with optional time and pagination filters.
   */
  async listDeletions(
    tenantId: string,
    query: ListDeletionsQuery = {},
    options: RequestOptions = {},
  ): Promise<PaginatedDeletionsResponse> {
    const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/audit/deletions", {
      params: {
        path: { tenantId },
        query,
      },
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Fetches the tenant ledger audit snapshot.
   */
  async getLedger(tenantId: string, options: RequestOptions = {}): Promise<LedgerAuditResponse> {
    const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/audit/ledger", {
      params: { path: { tenantId } },
      ...fetchInit(options),
    });

    return assertApiSuccess(data, error, response);
  }

  /**
   * Reads the tenant pipeline configuration.
   */
  async getTenantConfig(
    tenantId: string,
    options: RequestOptions = {},
  ): Promise<TenantPipelineConfig> {
    const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/config", {
      params: { path: { tenantId } },
      ...fetchInit(options),
    });
    const payload = assertApiSuccess(data, error, response);
    return payload.config;
  }

  /**
   * Applies a partial update to the tenant pipeline configuration.
   */
  async updateTenantConfig(
    tenantId: string,
    patch: TenantPipelineConfigPatch,
    options: RequestOptions = {},
  ): Promise<TenantPipelineConfig> {
    const { data, error, response } = await this.api.PATCH("/v1/tenants/{tenantId}/config", {
      params: { path: { tenantId } },
      body: patch,
      ...fetchInit(options),
    });
    const payload = assertApiSuccess(data, error, response);
    return payload.config;
  }

  /**
   * Polls {@link getRunStatus} until the run reaches `"done"` or `"failed"`.
   *
   * @see {@link waitForRun} for polling options and terminal states.
   */
  waitForRun(
    tenantId: string,
    runId: string,
    options: WaitForRunOptions = {},
  ): Promise<RunStatusResponse> {
    return waitForRun(this, tenantId, runId, options);
  }
}

/**
 * Creates a new {@link AnchorClient}.
 */
export function createAnchorClient(options: AnchorClientOptions): AnchorClient {
  return new AnchorClient(options);
}
