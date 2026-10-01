/** URL prefixes and paths for the public gateway (docs, auth, tenant proxy). */

export const TENANT_PATH_PREFIX = "/t";

/** Scalar when no workspace is published yet; not a proxy tenant id. */
export const DOCS_PLATFORM_PATH = "/docs/platform";

/** `X-Backed-Tenant` value when fetching platform `/openapi.json` upstream (not a registry tenant). */
export const PLATFORM_OPENAPI_UPSTREAM_TENANT = "platform";

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
