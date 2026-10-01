/** URL prefixes and paths for the public gateway (docs, auth, tenant proxy). */

export const TENANT_PATH_PREFIX = "/t";

export function tenantBasePath(tenantId: string): string {
  return `${TENANT_PATH_PREFIX}/${tenantId}`;
}

export const TENANT_OPENAPI_ROUTE = `${TENANT_PATH_PREFIX}/:tenantId/openapi.json`;

export function tenantOpenApiPath(tenantId: string): string {
  return `${tenantBasePath(tenantId)}/openapi.json`;
}

export function docsPathForTenant(tenantId: string): string {
  return `/docs${tenantBasePath(tenantId)}`;
}

export const GATEWAY_AUTH_PATHS = {
  login: "/login",
  logout: "/logout",
  docs: "/docs",
  platformOpenApi: "/openapi.json",
} as const;

export const REFERENCE_DOCS_PROXY_ERROR =
  "The reference docs tenant cannot call live data. Open /docs, pick your workspace, sign in, then use Try it out.";
