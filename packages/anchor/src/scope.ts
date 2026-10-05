export type TenantApiContext = {
  tenantId: string;
  url: (v1Suffix: string) => string;
  headers: Record<string, string>;
};
export function gatewayTenantContext(gatewayOrigin: string, tenantId: string): TenantApiContext {
  const root = gatewayOrigin.replace(/\/$/, "");
  return {
    tenantId,
    url: (v1Suffix) =>
      `${root}/t/${encodeURIComponent(tenantId)}${v1Suffix.startsWith("/") ? v1Suffix : `/${v1Suffix}`}`,
    headers: {},
  };
}
export function platformTenantContext(
  platformOrigin: string,
  token: string,
  tenantId: string,
): TenantApiContext {
  const root = platformOrigin.replace(/\/$/, "");
  return {
    tenantId,
    url: (v1Suffix) => {
      const path = v1Suffix.startsWith("/v1")
        ? v1Suffix
        : v1Suffix.startsWith("/")
          ? `/v1${v1Suffix}`
          : `/v1/${v1Suffix}`;
      return `${root}${path}`;
    },
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Backed-Tenant": tenantId,
    },
  };
}
