import type { TenantRegistrySource } from "@trybacked/core";
import type { Context } from "hono";
import type { GatewayConfig } from "./config.js";
import { isPublicDocsReferenceTenant } from "./docs-routes.js";
import type { GatewayVariables } from "./types.js";
import { assertTenantInRegistry, resolvePlatformUpstream } from "./upstreams.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cookie",
]);

export type ProxyDeps = {
  fetchImpl?: typeof fetch;
};

function copyForwardHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  return headers;
}

export async function forwardToPlatform(
  config: GatewayConfig,
  tenantId: string,
  username: string,
  request: Request,
  upstreamPath: string,
  deps: ProxyDeps = {},
): Promise<Response> {
  const fetchFn = deps.fetchImpl ?? fetch;
  const upstream = resolvePlatformUpstream(config);
  const url = new URL(upstreamPath, `${upstream.baseUrl}/`);
  const headers = copyForwardHeaders(request.headers);
  headers.set("Authorization", `Bearer ${upstream.token}`);
  headers.set("X-Backed-User", username);
  headers.set("X-Backed-Tenant", tenantId);

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstreamResponse = await fetchFn(url, init);
    const responseHeaders = new Headers();
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "content-disposition",
      "x-backed-document-page",
    ]) {
      const value = upstreamResponse.headers.get(name);
      if (value !== null) {
        responseHeaders.set(name, value);
      }
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export function tenantPathFromRequest(pathname: string, tenantId: string): string | undefined {
  const prefix = `/t/${tenantId}`;
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const rest = pathname.slice(prefix.length);
  if (rest.length === 0) {
    return "/";
  }
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export async function handleTenantProxy(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  registrySource: TenantRegistrySource,
  tenantId: string,
  deps: ProxyDeps,
): Promise<Response> {
  if (isPublicDocsReferenceTenant(tenantId)) {
    return c.json(
      {
        error:
          "The reference docs tenant cannot call live data. Open /docs, pick your workspace (e.g. gerace), sign in, then use Try it out.",
      },
      400,
    );
  }
  const user = c.get("user");
  if (!user.tenants.includes(tenantId)) {
    return c.json(
      {
        error: "Forbidden",
        message: `Your session does not include tenant "${tenantId}". GET /me lists the tenants it does include; sign out and sign in again to pick up a new mapping.`,
      },
      403,
    );
  }
  if (!(await assertTenantInRegistry(registrySource, tenantId))) {
    return c.json({ error: "Tenant not found" }, 404);
  }
  const upstreamPath = tenantPathFromRequest(c.req.path, tenantId);
  if (upstreamPath === undefined) {
    return c.json({ error: "Bad path" }, 400);
  }
  const query = new URL(c.req.url).search;
  return forwardToPlatform(
    config,
    tenantId,
    user.username,
    c.req.raw,
    `${upstreamPath}${query}`,
    deps,
  );
}

export async function handleDefaultTenantProxy(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  registrySource: TenantRegistrySource,
  deps: ProxyDeps,
): Promise<Response> {
  const defaultTenant = config.defaultTenant;
  if (defaultTenant === undefined) {
    return c.json({ error: "Default tenant not configured" }, 503);
  }
  const user = c.get("user");
  if (!user.tenants.includes(defaultTenant)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  if (!(await assertTenantInRegistry(registrySource, defaultTenant))) {
    return c.json({ error: "Tenant not found" }, 404);
  }
  const url = new URL(c.req.url);
  return forwardToPlatform(
    config,
    defaultTenant,
    user.username,
    c.req.raw,
    `${url.pathname}${url.search}`,
    deps,
  );
}
