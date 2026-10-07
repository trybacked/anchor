import { statSync } from "node:fs";
import { loadTenantsRegistry, type TenantsRegistry } from "./tenants-registry.js";
/**
 *
 */
export type TenantRegistrySnapshot = {
  registry: TenantsRegistry;
  version: string;
};
/**
 *
 */
export type TenantRegistrySource = {
  load: () => Promise<TenantRegistrySnapshot>;
};
/**
 *
 */
export function createFileRegistrySource(registryPath: string): TenantRegistrySource {
  return {
    load: () => {
      let version = "0";
      try {
        version = String(statSync(registryPath).mtimeMs);
      } catch {
        version = "0";
      }
      return Promise.resolve({
        registry: loadTenantsRegistry(registryPath),
        version,
      });
    },
  };
}
type HttpRegistrySourceOptions = {
  url: string;
  token: string;
  ttlSeconds?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
};
/**
 *
 */
export function createHttpRegistrySource(options: HttpRegistrySourceOptions): TenantRegistrySource {
  const ttlMs = (options.ttlSeconds ?? 60) * 1000;
  let cached: TenantRegistrySnapshot | undefined;
  let cachedAt = 0;
  let etag: string | undefined;
  return {
    load: async () => {
      const now = Date.now();
      if (cached !== undefined && now - cachedAt < ttlMs) {
        return cached;
      }
      const fetchFn = options.fetchImpl ?? fetch;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.token}`,
      };
      if (etag !== undefined) {
        headers["If-None-Match"] = etag;
      }
      const response = await fetchFn(options.url, { headers });
      if (response.status === 304 && cached !== undefined) {
        cachedAt = now;
        return cached;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Registry HTTP ${String(response.status)}: ${body}`);
      }
      const nextEtag = response.headers.get("etag") ?? undefined;
      const payload = (await response.json()) as TenantsRegistry;
      cached = {
        registry: payload,
        version: nextEtag ?? String(now),
      };
      cachedAt = now;
      if (nextEtag !== undefined) {
        etag = nextEtag;
      }
      return cached;
    },
  };
}
/**
 *
 */
export type RegistrySourceMode = "file" | "http";
/**
 *
 */
export function resolveRegistrySourceFromEnv(env: NodeJS.ProcessEnv): {
  mode: RegistrySourceMode;
  filePath?: string | undefined;
  httpUrl?: string | undefined;
  httpToken?: string | undefined;
} {
  const modeRaw = (env["BACKED_REGISTRY_SOURCE"] ?? "file").trim().toLowerCase();
  const mode: RegistrySourceMode = modeRaw === "http" ? "http" : "file";
  if (mode === "http") {
    const httpUrl = env["BACKED_REGISTRY_URL"]?.trim();
    const httpToken = env["BACKED_REGISTRY_TOKEN"]?.trim();
    if (httpUrl === undefined || httpUrl.length === 0) {
      throw new Error("BACKED_REGISTRY_URL is required when BACKED_REGISTRY_SOURCE=http.");
    }
    if (httpToken === undefined || httpToken.length === 0) {
      throw new Error("BACKED_REGISTRY_TOKEN is required when BACKED_REGISTRY_SOURCE=http.");
    }
    return { mode, httpUrl, httpToken };
  }
  const filePath =
    env["ANCHOR_TENANTS_REGISTRY"]?.trim() ??
    env["GATEWAY_TENANTS_REGISTRY"]?.trim() ??
    "/etc/backed/tenants.yaml";
  return { mode, filePath };
}
/**
 *
 */
export function createRegistrySourceFromEnv(env: NodeJS.ProcessEnv): TenantRegistrySource {
  const resolved = resolveRegistrySourceFromEnv(env);
  if (resolved.mode === "http") {
    const ttlRaw = env["BACKED_REGISTRY_TTL_SECONDS"]?.trim();
    const ttlSeconds = ttlRaw !== undefined && ttlRaw.length > 0 ? Number(ttlRaw) : undefined;
    return createHttpRegistrySource({
      url: resolved.httpUrl ?? "",
      token: resolved.httpToken ?? "",
      ...(ttlSeconds !== undefined && !Number.isNaN(ttlSeconds) ? { ttlSeconds } : {}),
    });
  }
  return createFileRegistrySource(resolved.filePath ?? "/etc/backed/tenants.yaml");
}
