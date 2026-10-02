import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

const SharedSpaceSchema = z.object({
  catalog: z.string().min(1),
  schema: z.string().min(1),
  privileges: z.array(z.string()).optional(),
});

const TenantEntrySchema = z.object({
  catalog: z.string().min(1),
  mcp: z.string().min(1),
  shared: z.array(z.string().min(1)),
  ontologyVersion: z.number().int().nonnegative().optional(),
});

export const TenantsRegistrySchema = z.object({
  enrollment: z.object({
    host: z.string().min(1),
    profile: z.string().min(1),
    bundle_target: z.string().min(1).optional(),
    warehouse_id: z.string().min(1),
    platform_principal: z.string().min(1).optional(),
  }),
  shared_spaces: z.record(SharedSpaceSchema),
  tenants: z.record(TenantEntrySchema),
});

export type TenantsRegistry = z.infer<typeof TenantsRegistrySchema>;

export function loadTenantsRegistry(registryPath: string): TenantsRegistry {
  const raw = readFileSync(registryPath, "utf8");
  return TenantsRegistrySchema.parse(parseYaml(raw));
}

export function saveTenantsRegistry(registryPath: string, registry: TenantsRegistry): void {
  writeFileSync(registryPath, stringifyYaml(registry), "utf8");
}

export function resolveTenantCatalog(tenantId: string): string {
  return tenantId === "backed" ? "backed" : `backed_${tenantId}`;
}

export function resolveBundleTarget(
  tenantId: string,
  enrollmentTarget: string | undefined,
): string {
  if (tenantId === "backed") {
    return enrollmentTarget ?? "ff";
  }
  return `tenant_${tenantId}`;
}

export function ensureTenantInRegistry(
  registry: TenantsRegistry,
  tenantId: string,
  sharedKeys: string[],
): TenantsRegistry {
  if (registry.tenants[tenantId] !== undefined) {
    return registry;
  }
  const catalog = resolveTenantCatalog(tenantId);
  return {
    ...registry,
    tenants: {
      ...registry.tenants,
      [tenantId]: {
        catalog,
        mcp: `backed-${tenantId}`,
        shared: sharedKeys,
      },
    },
  };
}

export function validateTenantId(tenantId: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(tenantId)) {
    throw new Error(
      `Invalid tenant id "${tenantId}" — use lowercase letters, digits, and underscores (e.g. gerace).`,
    );
  }
}
