import { TenantsRegistrySchema, type TenantsRegistry } from "@trybacked/core";
import { z } from "zod";

const ControlPlaneConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  databaseUrl: z.string().min(1),
  adminToken: z.string().min(16),
  internalToken: z.string().min(16),
  enrollmentHost: z.string().min(1),
  enrollmentWarehouseId: z.string().min(1),
  enrollmentProfile: z.string().min(1),
  enrollmentBundleTarget: z.string().min(1).optional(),
  platformPrincipal: z.string().min(1).optional(),
  sharedSpacesJson: z.string().min(2),
  databricksHost: z.string().min(1),
  databricksToken: z.string().min(1),
  databricksWarehouseId: z.string().min(1),
});

export type ControlPlaneConfig = z.infer<typeof ControlPlaneConfigSchema>;

export function readControlPlaneConfig(env: NodeJS.ProcessEnv): ControlPlaneConfig {
  const databaseUrl = env["DATABASE_URL"]?.trim();
  const adminToken = env["CONTROL_PLANE_ADMIN_TOKEN"]?.trim();
  const internalToken = env["CONTROL_PLANE_INTERNAL_TOKEN"]?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("DATABASE_URL is required.");
  }
  if (adminToken === undefined || adminToken.length === 0) {
    throw new Error("CONTROL_PLANE_ADMIN_TOKEN is required.");
  }
  if (internalToken === undefined || internalToken.length === 0) {
    throw new Error("CONTROL_PLANE_INTERNAL_TOKEN is required.");
  }

  const enrollmentHost =
    env["CONTROL_PLANE_ENROLLMENT_HOST"]?.trim() ?? env["BACKED_DATABRICKS_HOST"]?.trim();
  const databricksHost = env["BACKED_DATABRICKS_HOST"]?.trim();
  const databricksToken = env["BACKED_DATABRICKS_TOKEN"]?.trim();
  const databricksWarehouseId = env["BACKED_DATABRICKS_WAREHOUSE_ID"]?.trim();
  if (enrollmentHost === undefined || enrollmentHost.length === 0) {
    throw new Error("CONTROL_PLANE_ENROLLMENT_HOST or BACKED_DATABRICKS_HOST is required.");
  }
  if (databricksHost === undefined || databricksToken === undefined || databricksWarehouseId === undefined) {
    throw new Error("BACKED_DATABRICKS_HOST, BACKED_DATABRICKS_TOKEN, BACKED_DATABRICKS_WAREHOUSE_ID required.");
  }

  return ControlPlaneConfigSchema.parse({
    host: env["CONTROL_PLANE_HOST"] ?? env["HOST"] ?? "0.0.0.0",
    port: Number(env["CONTROL_PLANE_PORT"] ?? env["PORT"] ?? 8791),
    databaseUrl,
    adminToken,
    internalToken,
    enrollmentHost,
    enrollmentWarehouseId:
      env["CONTROL_PLANE_ENROLLMENT_WAREHOUSE_ID"]?.trim() ??
      env["BACKED_DATABRICKS_WAREHOUSE_ID"]?.trim(),
    enrollmentProfile: env["CONTROL_PLANE_ENROLLMENT_PROFILE"]?.trim() ?? "DEFAULT",
    enrollmentBundleTarget: env["CONTROL_PLANE_ENROLLMENT_BUNDLE_TARGET"]?.trim(),
    platformPrincipal: env["BACKED_PLATFORM_PRINCIPAL"]?.trim(),
    sharedSpacesJson: env["CONTROL_PLANE_SHARED_SPACES_JSON"]?.trim() ?? '{"anac":{"catalog":"backed","schema":"anac"}}',
    databricksHost,
    databricksToken,
    databricksWarehouseId,
  });
}

export function buildEnrollmentRegistry(config: ControlPlaneConfig): Pick<
  TenantsRegistry,
  "enrollment" | "shared_spaces"
> {
  const sharedRaw = JSON.parse(config.sharedSpacesJson) as unknown;
  const host = config.enrollmentHost.startsWith("http")
    ? config.enrollmentHost
    : `https://${config.enrollmentHost}`;
  const partial = {
    enrollment: {
      host,
      profile: config.enrollmentProfile,
      warehouse_id: config.enrollmentWarehouseId,
      ...(config.enrollmentBundleTarget !== undefined
        ? { bundle_target: config.enrollmentBundleTarget }
        : {}),
      ...(config.platformPrincipal !== undefined
        ? { platform_principal: config.platformPrincipal }
        : {}),
    },
    shared_spaces: sharedRaw,
    tenants: {},
  };
  const parsed = TenantsRegistrySchema.parse(partial);
  return { enrollment: parsed.enrollment, shared_spaces: parsed.shared_spaces };
}
