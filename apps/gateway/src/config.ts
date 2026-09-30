import { loadTenantsRegistry } from "@trybacked/core";
import { z } from "zod";

const GatewayConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  sessionSecret: z.string().min(32),
  sessionTtlSeconds: z.number().int().positive(),
  cookieSecure: z.boolean(),
  tenantsRegistryPath: z.string().min(1),
  usersFilePath: z.string().min(1),
  multiTenant: z.boolean(),
  rateLimitPerMinute: z.number().int().positive(),
  upstreams: z.record(z.string().min(1)),
  upstreamTokens: z.record(z.string().min(1)),
  defaultUpstream: z.string().min(1).optional(),
  defaultUpstreamToken: z.string().min(1).optional(),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

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

function parseUpstreams(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (raw === undefined || raw.trim().length === 0) {
    return map;
  }
  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid GATEWAY_UPSTREAMS segment "${trimmed}" — expected tenantId=url`);
    }
    const tenantId = trimmed.slice(0, eq).trim();
    const baseUrl = trimmed.slice(eq + 1).trim().replace(/\/+$/, "");
    map[tenantId] = baseUrl;
  }
  return map;
}

function collectUpstreamTokens(
  env: NodeJS.ProcessEnv,
  tenantIds: string[],
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const tenantId of tenantIds) {
    const envKey = `GATEWAY_TENANT_TOKEN_${tenantId.toUpperCase()}`;
    const token = env[envKey]?.trim();
    if (token !== undefined && token.length > 0) {
      tokens[tenantId] = token;
    }
  }
  return tokens;
}

export function readGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  const sessionSecret = env["GATEWAY_SESSION_SECRET"]?.trim();
  if (sessionSecret === undefined || sessionSecret.length === 0) {
    throw new Error("GATEWAY_SESSION_SECRET is required (min 32 characters).");
  }

  const multiTenant = parseBoolean(env["WORKSHOP_MULTI_TENANT"], true);
  const upstreams = parseUpstreams(env["GATEWAY_UPSTREAMS"]);
  const upstreamTokens = collectUpstreamTokens(env, Object.keys(upstreams));

  const defaultUpstream = env["GATEWAY_DEFAULT_UPSTREAM"]?.trim().replace(/\/+$/, "");
  const defaultUpstreamToken = env["GATEWAY_DEFAULT_UPSTREAM_TOKEN"]?.trim();

  if (multiTenant) {
    for (const tenantId of Object.keys(upstreams)) {
      if (upstreamTokens[tenantId] === undefined) {
        throw new Error(`Missing env GATEWAY_TENANT_TOKEN_${tenantId.toUpperCase()} for upstream "${tenantId}".`);
      }
    }
  } else {
    if (defaultUpstream === undefined || defaultUpstream.length === 0) {
      throw new Error("GATEWAY_DEFAULT_UPSTREAM is required when WORKSHOP_MULTI_TENANT=false.");
    }
    if (defaultUpstreamToken === undefined || defaultUpstreamToken.length === 0) {
      throw new Error("GATEWAY_DEFAULT_UPSTREAM_TOKEN is required when WORKSHOP_MULTI_TENANT=false.");
    }
  }

  const nodeEnv = env["NODE_ENV"] ?? "development";
  const cookieSecure = parseBoolean(env["GATEWAY_COOKIE_SECURE"], nodeEnv === "production");

  return GatewayConfigSchema.parse({
    host: env["GATEWAY_HOST"] ?? env["HOST"] ?? "127.0.0.1",
    port: Number(env["GATEWAY_PORT"] ?? env["PORT"] ?? 8790),
    sessionSecret,
    sessionTtlSeconds: Number(env["GATEWAY_SESSION_TTL_SECONDS"] ?? 28800),
    cookieSecure,
    tenantsRegistryPath: env["GATEWAY_TENANTS_REGISTRY"] ?? "../tenants.yaml",
    usersFilePath: env["GATEWAY_USERS_FILE"] ?? "users.yaml",
    multiTenant,
    rateLimitPerMinute: Number(env["GATEWAY_RATE_LIMIT_PER_MINUTE"] ?? 60),
    upstreams,
    upstreamTokens,
    ...(defaultUpstream !== undefined && defaultUpstream.length > 0 ? { defaultUpstream } : {}),
    ...(defaultUpstreamToken !== undefined && defaultUpstreamToken.length > 0
      ? { defaultUpstreamToken }
      : {}),
  });
}

export function countConfiguredTenants(config: GatewayConfig): number {
  const registry = loadTenantsRegistry(config.tenantsRegistryPath);
  const registryIds = new Set(Object.keys(registry.tenants));
  if (config.multiTenant) {
    let count = 0;
    for (const tenantId of Object.keys(config.upstreams)) {
      if (registryIds.has(tenantId)) {
        count += 1;
      } else {
        console.error(`Gateway upstream "${tenantId}" is not listed in tenants registry.`);
      }
    }
    for (const tenantId of registryIds) {
      if (config.upstreams[tenantId] === undefined) {
        console.error(`Tenant "${tenantId}" in registry has no GATEWAY_UPSTREAMS entry.`);
      }
    }
    return count;
  }
  return 1;
}
