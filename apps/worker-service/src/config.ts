import {
    DEFAULT_MAX_UPLOAD_BYTES,
    DEFAULT_MAX_UPLOAD_FILES,
    DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
} from "@backed/runner";

export const SERVICE_NAME = "backed-worker-service";
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8790;
export const DEFAULT_DATA_ROOT = "./worker-data";

export const ENV = {
    HOST: "WORKER_SERVICE_HOST",
    PORT: "WORKER_SERVICE_PORT",
    DATA_ROOT: "WORKER_SERVICE_DATA_ROOT",
    AUTH_TOKEN: "WORKER_SERVICE_AUTH_TOKEN",
    PARTNERS_JSON: "WORKER_SERVICE_PARTNERS_JSON",
    MAX_UPLOAD_BYTES: "WORKER_SERVICE_MAX_UPLOAD_BYTES",
    MAX_UPLOAD_FILES: "WORKER_SERVICE_MAX_UPLOAD_FILES",
    RATE_LIMIT_WINDOW_MS: "WORKER_SERVICE_RATE_LIMIT_WINDOW_MS",
    RATE_LIMIT_MAX_REQUESTS: "WORKER_SERVICE_RATE_LIMIT_MAX_REQUESTS",
    SKIP_EMBED: "WORKER_SERVICE_SKIP_EMBED",
} as const;

export interface PartnerWebhooksConfig {
    runCompleted?: string;
}

export interface PartnerConfig {
    partnerId: string;
    token: string;
    tenantIdPattern?: string;
    webhooks?: PartnerWebhooksConfig;
    webhookSecret?: string;
}

export interface WorkerServiceConfig {
    host: string;
    port: number;
    dataRoot: string;
    authToken: string;
    partners: PartnerConfig[];
    maxUploadBytes: number;
    maxUploadFiles: number;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    skipEmbed: boolean;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw.trim().length === 0) {
        return fallback;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined || raw.trim().length === 0) {
        return fallback;
    }
    switch (raw.trim().toLowerCase()) {
        case "1":
        case "true":
        case "yes":
        case "on":
            return true;
        case "0":
        case "false":
        case "no":
        case "off":
            return false;
        default:
            return fallback;
    }
}

function parsePartnersJson(raw: string | undefined): PartnerConfig[] {
    if (raw === undefined || raw.trim().length === 0) {
        return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`${ENV.PARTNERS_JSON} must be a JSON array`);
    }
    return parsed.map((entry) => {
        if (entry === null || typeof entry !== "object") {
            throw new Error(`${ENV.PARTNERS_JSON} entries must be objects`);
        }
        const record = entry as Record<string, unknown>;
        const partnerId = record["partnerId"];
        const token = record["token"];
        const tenantIdPattern = record["tenantIdPattern"];
        const webhookSecret = record["webhookSecret"];
        const webhooksRaw = record["webhooks"];
        if (typeof partnerId !== "string" || partnerId.length === 0) {
            throw new Error(`${ENV.PARTNERS_JSON} entries require partnerId`);
        }
        if (typeof token !== "string" || token.length === 0) {
            throw new Error(`${ENV.PARTNERS_JSON} entries require token`);
        }
        let webhooks: PartnerWebhooksConfig | undefined;
        if (webhooksRaw !== undefined) {
            if (webhooksRaw === null || typeof webhooksRaw !== "object") {
                throw new Error(`${ENV.PARTNERS_JSON} webhooks must be an object`);
            }
            const webhooksRecord = webhooksRaw as Record<string, unknown>;
            const runCompleted = webhooksRecord["runCompleted"];
            if (runCompleted !== undefined && typeof runCompleted !== "string") {
                throw new Error(`${ENV.PARTNERS_JSON} webhooks.runCompleted must be a string`);
            }
            webhooks = {
                ...(typeof runCompleted === "string" && runCompleted.length > 0
                    ? { runCompleted }
                    : {}),
            };
        }
        return {
            partnerId,
            token,
            ...(typeof tenantIdPattern === "string" && tenantIdPattern.length > 0
                ? { tenantIdPattern }
                : {}),
            ...(webhooks !== undefined ? { webhooks } : {}),
            ...(typeof webhookSecret === "string" && webhookSecret.length > 0
                ? { webhookSecret }
                : {}),
        };
    });
}

export function loadWorkerServiceConfig(env: Record<string, string | undefined> = process.env): WorkerServiceConfig {
    const authToken = env[ENV.AUTH_TOKEN]?.trim() ?? "";
    const partners = parsePartnersJson(env[ENV.PARTNERS_JSON]);
    if (authToken.length === 0 && partners.length === 0) {
        throw new Error(`Missing ${ENV.AUTH_TOKEN} or ${ENV.PARTNERS_JSON}`);
    }
    return {
        host: env[ENV.HOST]?.trim() || DEFAULT_HOST,
        port: readPositiveInt(env[ENV.PORT], DEFAULT_PORT),
        dataRoot: env[ENV.DATA_ROOT]?.trim() || DEFAULT_DATA_ROOT,
        authToken,
        partners,
        maxUploadBytes: readPositiveInt(env[ENV.MAX_UPLOAD_BYTES], DEFAULT_MAX_UPLOAD_BYTES),
        maxUploadFiles: readPositiveInt(env[ENV.MAX_UPLOAD_FILES], DEFAULT_MAX_UPLOAD_FILES),
        rateLimitWindowMs: readPositiveInt(env[ENV.RATE_LIMIT_WINDOW_MS], DEFAULT_RATE_LIMIT_WINDOW_MS),
        rateLimitMaxRequests: readPositiveInt(env[ENV.RATE_LIMIT_MAX_REQUESTS], DEFAULT_RATE_LIMIT_MAX_REQUESTS),
        skipEmbed: readBoolean(env[ENV.SKIP_EMBED], true),
    };
}
