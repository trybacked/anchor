import { z } from "zod";

const GatewayAuthModeSchema = z.enum(["file", "workos"]);

const GatewayConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  sessionSecret: z.string().min(32),
  sessionTtlSeconds: z.number().int().positive(),
  cookieSecure: z.boolean(),
  tenantsRegistryPath: z.string().min(1),
  usersFilePath: z.string().min(1),
  authMode: GatewayAuthModeSchema,
  workosApiKey: z.string().min(1).optional(),
  workosClientId: z.string().min(1).optional(),
  workosRedirectUri: z.string().url().optional(),
  controlPlaneUrl: z.string().url().optional(),
  controlPlaneInternalToken: z.string().min(1).optional(),
  rateLimitPerMinute: z.number().int().positive(),
  platformUpstream: z.string().min(1),
  platformToken: z.string().min(1),
  defaultTenant: z.string().min(1).optional(),
  /** Canonical browser origin (e.g. https://api.backed.app) for docs Try it out behind TLS proxies. */
  publicOrigin: z.string().url().optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type GatewayAuthMode = z.infer<typeof GatewayAuthModeSchema>;

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

export function readGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  const sessionSecret = env["GATEWAY_SESSION_SECRET"]?.trim();
  if (sessionSecret === undefined || sessionSecret.length === 0) {
    throw new Error("GATEWAY_SESSION_SECRET is required (min 32 characters).");
  }

  const platformUpstream = env["GATEWAY_PLATFORM_UPSTREAM"]?.trim().replace(/\/+$/, "");
  const platformToken = env["GATEWAY_PLATFORM_TOKEN"]?.trim();
  if (platformUpstream === undefined || platformUpstream.length === 0) {
    throw new Error("GATEWAY_PLATFORM_UPSTREAM is required (e.g. http://platform-api:8787).");
  }
  if (platformToken === undefined || platformToken.length === 0) {
    throw new Error("GATEWAY_PLATFORM_TOKEN is required (must match ANCHOR_API_TOKEN).");
  }

  const defaultTenant = env["GATEWAY_DEFAULT_TENANT"]?.trim();
  const nodeEnv = env["NODE_ENV"] ?? "development";
  const cookieSecure = parseBoolean(env["GATEWAY_COOKIE_SECURE"], nodeEnv === "production");
  const authModeRaw = (env["GATEWAY_AUTH_MODE"] ?? "file").trim().toLowerCase();
  const authMode = authModeRaw === "workos" ? "workos" : "file";
  const workosApiKey = env["WORKOS_API_KEY"]?.trim();
  const workosClientId = env["WORKOS_CLIENT_ID"]?.trim();
  const workosRedirectUri = env["WORKOS_REDIRECT_URI"]?.trim();
  const controlPlaneUrl = env["BACKED_CONTROL_PLANE_URL"]?.trim();
  const controlPlaneInternalToken = env["CONTROL_PLANE_INTERNAL_TOKEN"]?.trim();

  if (authMode === "workos") {
    if (
      workosApiKey === undefined ||
      workosClientId === undefined ||
      workosRedirectUri === undefined
    ) {
      throw new Error(
        "GATEWAY_AUTH_MODE=workos requires WORKOS_API_KEY, WORKOS_CLIENT_ID, WORKOS_REDIRECT_URI.",
      );
    }
    if (controlPlaneUrl === undefined || controlPlaneInternalToken === undefined) {
      throw new Error(
        "GATEWAY_AUTH_MODE=workos requires BACKED_CONTROL_PLANE_URL and CONTROL_PLANE_INTERNAL_TOKEN.",
      );
    }
  }

  const publicOriginExplicit = env["GATEWAY_PUBLIC_ORIGIN"]?.trim().replace(/\/+$/, "");
  const publicOrigin =
    publicOriginExplicit !== undefined && publicOriginExplicit.length > 0
      ? publicOriginExplicit
      : workosRedirectUri !== undefined
        ? new URL(workosRedirectUri).origin
        : undefined;

  // Behind a TLS-terminating proxy the request URL is plain HTTP, so the browser-facing origin
  // cannot be inferred: docs would emit http:// server URLs and the browser would block them.
  if (cookieSecure && publicOrigin === undefined) {
    throw new Error(
      "GATEWAY_PUBLIC_ORIGIN is required when cookies are secure (e.g. https://api.backed.app).",
    );
  }

  return GatewayConfigSchema.parse({
    host: env["GATEWAY_HOST"] ?? env["HOST"] ?? "127.0.0.1",
    port: Number(env["PORT"] ?? env["GATEWAY_PORT"] ?? 8790),
    sessionSecret,
    sessionTtlSeconds: Number(env["GATEWAY_SESSION_TTL_SECONDS"] ?? 28800),
    cookieSecure,
    tenantsRegistryPath: env["GATEWAY_TENANTS_REGISTRY"] ?? "../tenants.yaml",
    usersFilePath: env["GATEWAY_USERS_FILE"] ?? "users.yaml",
    authMode,
    rateLimitPerMinute: Number(env["GATEWAY_RATE_LIMIT_PER_MINUTE"] ?? 60),
    platformUpstream,
    platformToken,
    ...(defaultTenant !== undefined && defaultTenant.length > 0 ? { defaultTenant } : {}),
    ...(workosApiKey !== undefined ? { workosApiKey } : {}),
    ...(workosClientId !== undefined ? { workosClientId } : {}),
    ...(workosRedirectUri !== undefined ? { workosRedirectUri } : {}),
    ...(controlPlaneUrl !== undefined ? { controlPlaneUrl } : {}),
    ...(controlPlaneInternalToken !== undefined ? { controlPlaneInternalToken } : {}),
    ...(publicOrigin !== undefined && publicOrigin.length > 0 ? { publicOrigin } : {}),
  });
}
