import type { FoundryWarehouseDiscoveryProfile } from "@trybacked/infrastructure";

const WAREHOUSE_PROFILE_PATH = "/v1/discovery/warehouse-profile";

function resolveWarehouseProfileRequest(options: {
  baseUrl: string;
  tenantId: string;
}): { url: string; tenantHeader: string | undefined } {
  const root = options.baseUrl.replace(/\/+$/, "");
  const gatewayTenantPrefix = `/t/${encodeURIComponent(options.tenantId)}`;
  if (root.endsWith(gatewayTenantPrefix)) {
    return { url: `${root}${WAREHOUSE_PROFILE_PATH}`, tenantHeader: options.tenantId };
  }
  if (/\/t\/[^/]+$/.test(root)) {
    return { url: `${root}${WAREHOUSE_PROFILE_PATH}`, tenantHeader: options.tenantId };
  }
  const publicGatewayPath = `${root}${gatewayTenantPrefix}${WAREHOUSE_PROFILE_PATH}`;
  const looksLikePublicGateway =
    root.includes("api.backed.app") ||
    root.includes("localhost") && root.includes("8080") === false;
  if (looksLikePublicGateway && !root.includes("railway.internal")) {
    return { url: publicGatewayPath, tenantHeader: undefined };
  }
  return { url: `${root}${WAREHOUSE_PROFILE_PATH}`, tenantHeader: options.tenantId };
}

const WAREHOUSE_PROFILE_FETCH_TIMEOUT_MS = 12_000;

export async function fetchWarehouseDiscoveryProfileFromPlatform(options: {
  baseUrl: string;
  tenantId: string;
  bearerToken: string;
}): Promise<FoundryWarehouseDiscoveryProfile | undefined> {
  const { url, tenantHeader } = resolveWarehouseProfileRequest(options);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.bearerToken}`,
  };
  if (tenantHeader !== undefined) {
    headers["X-Backed-Tenant"] = tenantHeader;
    headers["X-Backed-User"] = "control-plane-discovery";
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(WAREHOUSE_PROFILE_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[discovery] warehouse profile fetch skipped (network): tenant=${options.tenantId} url=${url} reason=${reason}`,
    );
    return undefined;
  }
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(
      `[discovery] warehouse profile fetch skipped (HTTP ${String(response.status)}): tenant=${options.tenantId} url=${url}${detail.length > 0 ? ` body=${detail.slice(0, 200)}` : ""}`,
    );
    return undefined;
  }
  return (await response.json()) as FoundryWarehouseDiscoveryProfile;
}
