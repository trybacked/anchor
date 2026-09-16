import { parseModelYaml } from "@backed/core";
import createClient from "openapi-fetch";
import { AnchorClientError, assertApiSuccess } from "./errors.js";
import type { paths } from "./generated/openapi.js";
import { buildAuthHeaders, stripTrailingSlash, tenantPath } from "./http.js";
import type {
    GetModelResult,
    HealthResponse,
    LedgerAuditResponse,
    ListDeletionsQuery,
    PaginatedDeletionsResponse,
    ReviewQuestionsResponse,
    ReviewSubmitRequest,
    ReviewSubmitResponse,
    RunStatusResponse,
    SubmitRunResponse,
} from "./types.js";
import { buildRunUploadFormData, type RunUploadInput } from "./upload.js";
import { waitForRun, type WaitForRunOptions } from "./wait-for-run.js";

export interface AnchorClientOptions {
    baseUrl: string;
    token: string;
    fetch?: typeof fetch;
    headers?: Record<string, string>;
}

export class AnchorClient {
    private readonly baseUrl: string;
    private readonly token: string;
    private readonly fetchImpl: typeof fetch;
    private readonly extraHeaders: Record<string, string>;
    private readonly api: ReturnType<typeof createClient<paths>>;

    constructor(options: AnchorClientOptions) {
        this.baseUrl = stripTrailingSlash(options.baseUrl);
        this.token = options.token;
        this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
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

    async health(): Promise<HealthResponse> {
        const { data, error, response } = await this.api.GET("/health");
        return assertApiSuccess(data, error, response);
    }

    async submitRun(tenantId: string, files: readonly RunUploadInput[]): Promise<SubmitRunResponse> {
        const body = buildRunUploadFormData(files);
        const { data, error, response } = await this.api.POST("/v1/tenants/{tenantId}/runs", {
            params: { path: { tenantId } },
            // FormData is valid at runtime; OpenAPI types model multipart fields as strings.
            body: body as never,
        });

        return assertApiSuccess(data, error, response);
    }

    async getRunStatus(tenantId: string, runId: string): Promise<RunStatusResponse> {
        const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/runs/{runId}", {
            params: { path: { tenantId, runId } },
        });

        return assertApiSuccess(data, error, response);
    }

    async getModel(tenantId: string, options: { ifNoneMatch?: string } = {}): Promise<GetModelResult> {
        const headers = buildAuthHeaders(this.token, this.extraHeaders);
        if (options.ifNoneMatch !== undefined) {
            headers.set("If-None-Match", options.ifNoneMatch);
        }

        const response = await this.fetchImpl(tenantPath(this.baseUrl, tenantId, "/model"), {
            method: "GET",
            headers,
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
            model: parseModelYaml(yaml),
            etag,
            yaml,
        };
    }

    async getReviewQuestions(tenantId: string): Promise<ReviewQuestionsResponse> {
        const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/review", {
            params: { path: { tenantId } },
        });

        return assertApiSuccess(data, error, response);
    }

    async submitReview(tenantId: string, request: ReviewSubmitRequest): Promise<ReviewSubmitResponse> {
        const { data, error, response } = await this.api.POST("/v1/tenants/{tenantId}/review", {
            params: { path: { tenantId } },
            body: request,
        });

        return assertApiSuccess(data, error, response);
    }

    async listDeletions(tenantId: string, query: ListDeletionsQuery = {}): Promise<PaginatedDeletionsResponse> {
        const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/audit/deletions", {
            params: {
                path: { tenantId },
                query,
            },
        });

        return assertApiSuccess(data, error, response);
    }

    async getLedger(tenantId: string): Promise<LedgerAuditResponse> {
        const { data, error, response } = await this.api.GET("/v1/tenants/{tenantId}/audit/ledger", {
            params: { path: { tenantId } },
        });

        return assertApiSuccess(data, error, response);
    }

    waitForRun(tenantId: string, runId: string, options: WaitForRunOptions = {}): Promise<RunStatusResponse> {
        return waitForRun(this, tenantId, runId, options);
    }
}

export function createAnchorClient(options: AnchorClientOptions): AnchorClient {
    return new AnchorClient(options);
}
