import type { TenantRegistrySource } from "@trybacked/core";
import type { GatewayConfig } from "./config.js";
export type PlatformUpstream = {
  baseUrl: string;
  token: string;
};
export function resolvePlatformUpstream(config: GatewayConfig): PlatformUpstream {
  return {
    baseUrl: config.platformUpstream,
    token: config.platformToken,
  };
}
export async function assertTenantInRegistry(
  source: TenantRegistrySource,
  tenantId: string,
): Promise<boolean> {
  const snapshot = await source.load();
  return snapshot.registry.tenants[tenantId] !== undefined;
}
export async function countConfiguredTenants(source: TenantRegistrySource): Promise<number> {
  const snapshot = await source.load();
  return Object.keys(snapshot.registry.tenants).length;
}
