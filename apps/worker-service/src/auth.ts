import type { PartnerRegistry } from "./partner-registry.js";

export type { AuthContext } from "./partner-registry.js";

export class TenantAccessDeniedError extends Error {
    constructor(tenantId: string, partnerId: string) {
        super(`Partner "${partnerId}" cannot access tenant "${tenantId}"`);
        this.name = "TenantAccessDeniedError";
    }
}

export function assertTenantAccess(
    auth: { partnerId: string },
    tenantId: string,
    registry: PartnerRegistry,
): void {
    if (auth.partnerId === "default") {
        return;
    }
    const partner = registry.getPartner(auth.partnerId);
    if (partner === undefined || partner.tenantIdPattern === undefined) {
        return;
    }
    const pattern = new RegExp(partner.tenantIdPattern);
    if (!pattern.test(tenantId)) {
        throw new TenantAccessDeniedError(tenantId, auth.partnerId);
    }
}
