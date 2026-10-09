import {
  DEFAULT_BACKED_S3_BUCKET,
  DEFAULT_BACKED_S3_REGION,
  TenantsRegistrySchema,
  type TenantsRegistry,
} from "@trybacked/core";
import { z } from "zod";

const ControlPlaneConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  databaseUrl: z.string().min(1),
  adminToken: z.string().min(16),
  internalToken: z.string().min(16),
  filesRoot: z.string().min(1),
  filesRegistryRoot: z.string().min(1),
  sharedSpacesJson: z.string().min(2),
  defaultSharedSpaces: z.array(z.string().min(1)),
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
  return Object.keys(parsed);
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
  const filesRoot = env["BACKED_FILES_ROOT"]?.trim() ?? "./sources";
  const filesRegistryRoot =
    env["BACKED_FILES_REGISTRY_ROOT"]?.trim() ?? "./.backed/remote-registry";
  const sharedSpacesJson =
    env["CONTROL_PLANE_SHARED_SPACES_JSON"]?.trim() ?? DEFAULT_SHARED_SPACES_JSON;
  const configuredSharedSpaces = sharedSpaceKeys(sharedSpacesJson);
  return ControlPlaneConfigSchema.parse({
    host: env["CONTROL_PLANE_HOST"] ?? env["HOST"] ?? "0.0.0.0",
    port: Number(env["PORT"] ?? env["CONTROL_PLANE_PORT"] ?? 8791),
    databaseUrl,
    adminToken,
    internalToken,
    filesRoot,
    filesRegistryRoot,
    sharedSpacesJson,
    defaultSharedSpaces: resolveDefaultSharedSpaces(env, configuredSharedSpaces),
  });
}

export function buildEnrollmentRegistry(
  config: ControlPlaneConfig,
  env: NodeJS.ProcessEnv = process.env,
): Pick<TenantsRegistry, "enrollment" | "shared_spaces"> {
  const sharedRaw = JSON.parse(config.sharedSpacesJson) as unknown;
  const partial = {
    enrollment: {
      storage: {
        provider: "s3",
        bucket: env["BACKED_S3_BUCKET"]?.trim() ?? DEFAULT_BACKED_S3_BUCKET,
        region: env["BACKED_S3_REGION"]?.trim() ?? DEFAULT_BACKED_S3_REGION,
      },
    },
    shared_spaces: sharedRaw,
    tenants: {},
  };
  const parsed = TenantsRegistrySchema.parse(partial);
  return { enrollment: parsed.enrollment, shared_spaces: parsed.shared_spaces };
}
