import type { TenantRegistrySource } from "@trybacked/core";
import type { GatewayConfig } from "./config.js";
import { isPublicDocsReferenceTenant } from "./docs-reference-tenant.js";
import { assertTenantInRegistry } from "./upstreams.js";

export async function listRegisteredTenantIds(source: TenantRegistrySource): Promise<string[]> {
  const snapshot = await source.load();
  return Object.keys(snapshot.registry.tenants).sort((a, b) => a.localeCompare(b));
}

/** Where `/docs` sends a visitor; the public reference is only for an empty registry. */
export type DocsLanding =
  | { kind: "tenant"; tenantId: string }
  | { kind: "reference" }
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
  return tenants.length === 0 ? { kind: "reference" } : { kind: "picker", tenants };
}

export async function canOpenTenantDocs(
  registrySource: TenantRegistrySource,
  tenantId: string,
): Promise<boolean> {
  if (isPublicDocsReferenceTenant(tenantId)) {
    return true;
  }
  return assertTenantInRegistry(registrySource, tenantId);
}
