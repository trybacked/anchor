export {
  TenantsRegistrySchema,
  ensureTenantInRegistry,
  loadTenantsRegistry,
  resolveEnrollmentBucket,
  resolveEnrollmentRegion,
  saveTenantsRegistry,
  validateTenantId,
  type TenantsRegistry,
} from "@trybacked/core";

export function resolveTenantCatalog(tenantId: string): string {
  return tenantId === "backed" ? "backed" : `backed_${tenantId}`;
}
