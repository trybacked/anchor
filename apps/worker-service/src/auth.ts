import type { WorkerServiceConfig } from "./config.js";

export interface AuthContext {
    partnerId: string;
}

export class TenantAccessDeniedError extends Error {
    constructor(tenantId: string, partnerId: string) {
        super(`Partner "${partnerId}" cannot access tenant "${tenantId}"`);
        this.name = "TenantAccessDeniedError";
    }
}

export function resolveAuthContext(token: string, config: WorkerServiceConfig): AuthContext | null {
    if (config.authToken.length > 0 && token === config.authToken) {
        return { partnerId: "default" };
    }
    for (const partner of config.partners) {
        if (token === partner.token) {
            return { partnerId: partner.partnerId };
        }
    }
    return null;
}

export function assertTenantAccess(auth: AuthContext, tenantId: string, config: WorkerServiceConfig): void {
    if (auth.partnerId === "default") {
        return;
    }
    const partner = config.partners.find((entry) => entry.partnerId === auth.partnerId);
    if (partner === undefined) {
        return;
    }
    if (partner.tenantIdPattern === undefined) {
        return;
    }
    const pattern = new RegExp(partner.tenantIdPattern);
    if (!pattern.test(tenantId)) {
        throw new TenantAccessDeniedError(tenantId, auth.partnerId);
    }
}
