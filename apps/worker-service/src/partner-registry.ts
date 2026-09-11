import type { ControlPlaneConfig, PartnerConfig, WorkerServiceConfig } from "./config.js";

export interface ResolvedPartner {
    partnerId: string;
    tenantIdPattern?: string;
    webhooks?: PartnerConfig["webhooks"];
    webhookSecret?: string;
}

export interface AuthContext {
    partnerId: string;
}

const TOKEN_CACHE_TTL_MS = 60_000;

interface TokenCacheEntry {
    partner: ResolvedPartner;
    expiresAt: number;
}

export interface PartnerRegistryOptions {
    config: WorkerServiceConfig;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

export class PartnerRegistry {
    private readonly tokenCache = new Map<string, TokenCacheEntry>();
    private readonly partnersById = new Map<string, ResolvedPartner>();
    private readonly envTokenIndex = new Map<string, ResolvedPartner>();
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;

    constructor(private readonly options: PartnerRegistryOptions) {
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? (() => Date.now());
        this.indexEnvPartners(options.config);
    }

    private indexEnvPartners(config: WorkerServiceConfig): void {
        for (const partner of config.partners) {
            const resolved = toResolvedPartner(partner);
            this.partnersById.set(partner.partnerId, resolved);
            this.envTokenIndex.set(partner.token, resolved);
        }
    }

    async resolveToken(token: string): Promise<AuthContext | null> {
        if (this.options.config.authToken.length > 0 && token === this.options.config.authToken) {
            return { partnerId: "default" };
        }
        const envPartner = this.envTokenIndex.get(token);
        if (envPartner !== undefined) {
            return { partnerId: envPartner.partnerId };
        }
        const cached = this.tokenCache.get(token);
        const currentTime = this.now();
        if (cached !== undefined && cached.expiresAt > currentTime) {
            return { partnerId: cached.partner.partnerId };
        }
        const controlPlane = this.options.config.controlPlane;
        if (controlPlane === undefined) {
            return null;
        }
        const resolved = await this.resolveViaControlPlane(token, controlPlane);
        if (resolved === null) {
            return null;
        }
        this.partnersById.set(resolved.partnerId, resolved);
        this.tokenCache.set(token, {
            partner: resolved,
            expiresAt: currentTime + TOKEN_CACHE_TTL_MS,
        });
        return { partnerId: resolved.partnerId };
    }

    getPartner(partnerId: string): ResolvedPartner | undefined {
        if (partnerId === "default") {
            return undefined;
        }
        return this.partnersById.get(partnerId);
    }

    private async resolveViaControlPlane(
        token: string,
        controlPlane: ControlPlaneConfig,
    ): Promise<ResolvedPartner | null> {
        const baseUrl = controlPlane.url.replace(/\/$/, "");
        const response = await this.fetchImpl(`${baseUrl}/internal/v1/auth/resolve`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${controlPlane.internalSecret}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
        });
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`Control plane auth resolve failed with status ${String(response.status)}`);
        }
        const payload: unknown = await response.json();
        if (payload === null || typeof payload !== "object") {
            throw new Error("Control plane auth resolve returned invalid JSON");
        }
        const partnerRaw = (payload as Record<string, unknown>)["partner"];
        if (partnerRaw === null || typeof partnerRaw !== "object") {
            throw new Error("Control plane auth resolve missing partner");
        }
        return parseControlPlanePartner(partnerRaw as Record<string, unknown>);
    }
}

export function createPartnerRegistry(options: PartnerRegistryOptions): PartnerRegistry {
    return new PartnerRegistry(options);
}

function toResolvedPartner(partner: PartnerConfig): ResolvedPartner {
    return {
        partnerId: partner.partnerId,
        ...(partner.tenantIdPattern !== undefined ? { tenantIdPattern: partner.tenantIdPattern } : {}),
        ...(partner.webhooks !== undefined ? { webhooks: partner.webhooks } : {}),
        ...(partner.webhookSecret !== undefined ? { webhookSecret: partner.webhookSecret } : {}),
    };
}

function parseControlPlanePartner(record: Record<string, unknown>): ResolvedPartner {
    const partnerId = record["partnerId"];
    if (typeof partnerId !== "string" || partnerId.length === 0) {
        throw new Error("Control plane partner missing partnerId");
    }
    const tenantIdPattern = record["tenantIdPattern"];
    const webhooksRaw = record["webhooks"];
    const webhookSecret = record["webhookSecret"];
    let webhooks: PartnerConfig["webhooks"] | undefined;
    if (webhooksRaw !== undefined) {
        if (webhooksRaw === null || typeof webhooksRaw !== "object") {
            throw new Error("Control plane partner webhooks must be an object");
        }
        const runCompleted = (webhooksRaw as Record<string, unknown>)["runCompleted"];
        if (typeof runCompleted === "string" && runCompleted.length > 0) {
            webhooks = { runCompleted };
        }
    }
    return {
        partnerId,
        ...(typeof tenantIdPattern === "string" && tenantIdPattern.length > 0
            ? { tenantIdPattern }
            : {}),
        ...(webhooks !== undefined ? { webhooks } : {}),
        ...(typeof webhookSecret === "string" && webhookSecret.length > 0
            ? { webhookSecret }
            : {}),
    };
}
