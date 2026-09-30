import { loadTenantsRegistry } from "@trybacked/core";
import type { GatewayConfig } from "./config.js";

export type TenantUpstream = {
  tenantId: string;
  baseUrl: string;
  token: string;
};

export function resolveTenantUpstream(
  config: GatewayConfig,
  tenantId: string,
): TenantUpstream | undefined {
  const baseUrl = config.upstreams[tenantId];
  const token = config.upstreamTokens[tenantId];
  if (baseUrl === undefined || token === undefined) {
    return undefined;
  }
  const registry = loadTenantsRegistry(config.tenantsRegistryPath);
  if (registry.tenants[tenantId] === undefined) {
    return undefined;
  }
  return { tenantId, baseUrl, token };
}

export function resolveDefaultUpstream(config: GatewayConfig): TenantUpstream | undefined {
  if (config.defaultUpstream === undefined || config.defaultUpstreamToken === undefined) {
    return undefined;
  }
  return {
    tenantId: "default",
    baseUrl: config.defaultUpstream,
    token: config.defaultUpstreamToken,
  };
}
