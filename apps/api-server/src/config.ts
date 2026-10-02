import { z } from "zod";

const ApiConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  workspaceRoot: z.string().optional(),
  apiToken: z.string().min(1),
  auditPrincipalId: z.string().min(1),
  auditLogPath: z.string().min(1).optional(),
  auditLogMirrorStderr: z.boolean(),
  platformMode: z.boolean(),
  tenantsRegistryPath: z.string().min(1).optional(),
  tenantCacheTtlSeconds: z.number().int().positive().optional(),
  maxUploadBytes: z.number().int().positive(),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return defaultValue;
}

export function readApiConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const token = env["ANCHOR_API_TOKEN"];
  if (token === undefined || token.trim().length === 0) {
    throw new Error("ANCHOR_API_TOKEN is required to start the Anchor API server.");
  }
  const host = env["ANCHOR_API_HOST"] ?? env["HOST"] ?? "127.0.0.1";
  const port = Number(env["PORT"] ?? env["ANCHOR_API_PORT"] ?? 8787);
  const workspaceRoot = env["ANCHOR_WORKSPACE_ROOT"]?.trim();
  const hasWorkspace = workspaceRoot !== undefined && workspaceRoot.length > 0;
  const platformMode = !hasWorkspace;
  if (platformMode && !parseBoolean(env["ANCHOR_PLATFORM_MODE"], true)) {
    throw new Error(
      "ANCHOR_PLATFORM_MODE=false requires ANCHOR_WORKSPACE_ROOT for legacy single-tenant mode.",
    );
  }
  const auditPrincipalId = token.slice(0, 8);
  const auditLogPath = env["ANCHOR_AUDIT_LOG_PATH"]?.trim();
  const auditLogMirrorStderr = env["ANCHOR_AUDIT_LOG_STDERR"] !== "0";
  const tenantsRegistryPath = env["ANCHOR_TENANTS_REGISTRY"]?.trim();
  const ttlRaw = env["ANCHOR_TENANT_CACHE_TTL_SECONDS"]?.trim();
  const tenantCacheTtlSeconds =
    ttlRaw !== undefined && ttlRaw.length > 0 ? Number(ttlRaw) : undefined;
  const maxUploadDefault = 50 * 1024 * 1024;
  const maxUploadRaw = env["ANCHOR_MAX_UPLOAD_BYTES"]?.trim();
  const maxUploadBytes =
    maxUploadRaw !== undefined && maxUploadRaw.length > 0 ? Number(maxUploadRaw) : maxUploadDefault;

  return ApiConfigSchema.parse({
    host,
    port,
    ...(workspaceRoot !== undefined && workspaceRoot.length > 0 ? { workspaceRoot } : {}),
    apiToken: token,
    auditPrincipalId,
    auditLogMirrorStderr,
    platformMode,
    ...(auditLogPath !== undefined && auditLogPath.length > 0 ? { auditLogPath } : {}),
    ...(tenantsRegistryPath !== undefined && tenantsRegistryPath.length > 0
      ? { tenantsRegistryPath }
      : platformMode
        ? { tenantsRegistryPath: "/etc/backed/tenants.yaml" }
        : {}),
    ...(tenantCacheTtlSeconds !== undefined && !Number.isNaN(tenantCacheTtlSeconds)
      ? { tenantCacheTtlSeconds }
      : {}),
    maxUploadBytes: Number.isNaN(maxUploadBytes) ? maxUploadDefault : maxUploadBytes,
  });
}
