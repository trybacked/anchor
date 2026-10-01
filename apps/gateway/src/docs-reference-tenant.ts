/**
 * Placeholder workspace id for Scalar when no tenant is published yet.
 * It never maps to registry data and must not reach the platform proxy as a real tenant.
 */
export const PUBLIC_DOCS_REFERENCE_TENANT = "reference";

export function isPublicDocsReferenceTenant(tenantId: string): boolean {
  return tenantId === PUBLIC_DOCS_REFERENCE_TENANT;
}
