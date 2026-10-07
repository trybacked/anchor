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
  defaultSharedSpaces: z.array(z.string().min(1)),
  databricksHost: z.string().min(1),
  databricksToken: z.string().min(1),
  databricksWarehouseId: z.string().min(1),
  /** Namespace of the document archive (Plan Fase 4: from config, not hardcoded). */
  documentsSchema: z.string().min(1),
});
export type ControlPlaneConfig = z.infer<typeof ControlPlaneConfigSchema>;
const DEFAULT_SHARED_SPACES_JSON = "{}";
function sharedSpaceKeys(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("CONTROL_PLANE_SHARED_SPACES_JSON is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("CONTROL_PLANE_SHARED_SPACES_JSON must be an object keyed by shared space.");
  }
  const keys = Object.keys(parsed);
  return keys;
}
function resolveDefaultSharedSpaces(env: NodeJS.ProcessEnv, configured: string[]): string[] {
  const requested = (env["CONTROL_PLANE_DEFAULT_SHARED_SPACES"] ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  if (requested.length === 0) {
    return configured;
  }
  const unknown = requested.filter((key) => !configured.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `CONTROL_PLANE_DEFAULT_SHARED_SPACES references unknown shared spaces: ${unknown.join(", ")}.`,
    );
  }
  return requested;
}
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
  const documentsSchema = (env["BACKED_DOCUMENTS_SCHEMA"] ?? "docs").trim();
  if (documentsSchema.length === 0) {
    throw new Error("BACKED_DOCUMENTS_SCHEMA must not be empty when set.");
  }
  if (enrollmentHost === undefined || enrollmentHost.length === 0) {
    throw new Error("CONTROL_PLANE_ENROLLMENT_HOST or BACKED_DATABRICKS_HOST is required.");
  }
  if (
    databricksHost === undefined ||
    databricksToken === undefined ||
    databricksWarehouseId === undefined
  ) {
    throw new Error(
      "BACKED_DATABRICKS_HOST, BACKED_DATABRICKS_TOKEN, BACKED_DATABRICKS_WAREHOUSE_ID required.",
    );
  }
  const sharedSpacesJson =
    env["CONTROL_PLANE_SHARED_SPACES_JSON"]?.trim() ?? DEFAULT_SHARED_SPACES_JSON;
  const configuredSharedSpaces = sharedSpaceKeys(sharedSpacesJson);
  return ControlPlaneConfigSchema.parse({
    host: env["CONTROL_PLANE_HOST"] ?? env["HOST"] ?? "0.0.0.0",
    port: Number(env["PORT"] ?? env["CONTROL_PLANE_PORT"] ?? 8791),
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
    sharedSpacesJson,
    defaultSharedSpaces: resolveDefaultSharedSpaces(env, configuredSharedSpaces),
    documentsSchema,
    databricksHost,
    databricksToken,
    databricksWarehouseId,
  });
}
export function buildEnrollmentRegistry(
  config: ControlPlaneConfig,
): Pick<TenantsRegistry, "enrollment" | "shared_spaces"> {
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
