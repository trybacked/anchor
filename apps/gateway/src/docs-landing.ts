import type { TenantRegistrySource } from "@trybacked/core";
import type { GatewayConfig } from "./config.js";
import { assertTenantInRegistry } from "./upstreams.js";

export async function listRegisteredTenantIds(source: TenantRegistrySource): Promise<string[]> {
  const snapshot = await source.load();
  return Object.keys(snapshot.registry.tenants).sort((a, b) => a.localeCompare(b));
}

export type DocsLanding =
  | { kind: "tenant"; tenantId: string }
  | { kind: "platform" }
  | { kind: "picker"; tenants: string[] };

export async function resolveDocsLanding(
  registrySource: TenantRegistrySource,
  config: GatewayConfig,
): Promise<DocsLanding> {
  const tenants = await listRegisteredTenantIds(registrySource);
  const defaultTenant = config.defaultTenant;
  if (defaultTenant !== undefined && tenants.includes(defaultTenant)) {
    return { kind: "tenant", tenantId: defaultTenant };
  }
  const [firstTenant] = tenants;
  if (tenants.length === 1 && firstTenant !== undefined) {
    return { kind: "tenant", tenantId: firstTenant };
  }
  return tenants.length === 0 ? { kind: "platform" } : { kind: "picker", tenants };
}

export async function canOpenTenantDocs(
  registrySource: TenantRegistrySource,
  tenantId: string,
): Promise<boolean> {
  return assertTenantInRegistry(registrySource, tenantId);
}
