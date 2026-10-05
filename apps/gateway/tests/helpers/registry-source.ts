import type { TenantRegistrySource, TenantsRegistry } from "@trybacked/core";
export function mockRegistrySource(registry: TenantsRegistry): TenantRegistrySource {
  return {
    load: async () => ({ registry, version: "test" }),
  };
}
