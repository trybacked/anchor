import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

const SharedSpaceSchema = z.object({
  catalog: z.string().min(1),
  schema: z.string().min(1),
  privileges: z.array(z.string()).optional(),
});
const TenantCapabilitiesSchema = z.object({
  aiAsk: z.boolean().optional(),
});
const TenantEntrySchema = z.object({
  catalog: z.string().min(1),
  mcp: z.string().min(1),
  shared: z.array(z.string().min(1)),
  ontologyVersion: z.number().int().nonnegative().optional(),
  capabilities: TenantCapabilitiesSchema.optional(),
});
export const DEFAULT_BACKED_S3_BUCKET = "backed-v1";

export const DEFAULT_BACKED_S3_REGION = "eu-north-1";

export const EnrollmentStorageSchema = z.object({
  provider: z.literal("s3"),
  bucket: z.string().min(1),
  region: z.string().min(1).optional(),
});

export const TenantsRegistrySchema = z.object({
  enrollment: z.object({
    storage: EnrollmentStorageSchema,
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

export function resolveEnrollmentBucket(registry: TenantsRegistry): string {
  return registry.enrollment.storage.bucket;
}

export function resolveEnrollmentRegion(registry: TenantsRegistry): string {
  return registry.enrollment.storage.region ?? DEFAULT_BACKED_S3_REGION;
}

export function ensureTenantInRegistry(
  registry: TenantsRegistry,
  tenantId: string,
  sharedKeys: string[],
  catalog: string,
): TenantsRegistry {
  if (registry.tenants[tenantId] !== undefined) {
    return registry;
  }
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
