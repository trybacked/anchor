import type { FoundryWarehouseDiscoveryProfile } from "@trybacked/infrastructure";

export async function fetchWarehouseDiscoveryProfileFromPlatform(options: {
  baseUrl: string;
  tenantId: string;
  bearerToken: string;
}): Promise<FoundryWarehouseDiscoveryProfile | undefined> {
  const root = options.baseUrl.replace(/\/+$/, "");
  const path = `/t/${encodeURIComponent(options.tenantId)}/v1/discovery/warehouse-profile`;
  const url = `${root}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${options.bearerToken}`,
    },
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Warehouse profile fetch failed (${String(response.status)})`);
  }
  return (await response.json()) as FoundryWarehouseDiscoveryProfile;
}
