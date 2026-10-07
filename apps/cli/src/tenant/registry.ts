export {
  TenantsRegistrySchema,
  ensureTenantInRegistry,
  loadTenantsRegistry,
  resolveBundleTarget,
  saveTenantsRegistry,
  validateTenantId,
  type TenantsRegistry,
} from "@trybacked/core";

/**
 * Legacy enrollment naming (Plan Fase 2): the catalog is seeded per tenant in
 * `tenants.yaml`; this fallback only exists for the CLI bootstrap of tenants
 * that predate an explicit catalog entry. Never used by the kernel or apps.
 */
export function resolveTenantCatalog(tenantId: string): string {
  return tenantId === "backed" ? "backed" : `backed_${tenantId}`;
}
