import type { Context } from "hono";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";
import { resolveDefaultUpstream, resolveTenantUpstream, type TenantUpstream } from "./upstreams.js";

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

export async function forwardToUpstream(
  upstream: TenantUpstream,
  username: string,
  request: Request,
  upstreamPath: string,
  deps: ProxyDeps = {},
): Promise<Response> {
  const fetchFn = deps.fetchImpl ?? fetch;
  const url = new URL(upstreamPath, `${upstream.baseUrl}/`);
  const headers = copyForwardHeaders(request.headers);
  headers.set("Authorization", `Bearer ${upstream.token}`);
  headers.set("X-Backed-User", username);

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
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType !== null) {
      responseHeaders.set("content-type", contentType);
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
  tenantId: string,
  deps: ProxyDeps,
): Promise<Response> {
  const user = c.get("user");
  if (!user.tenants.includes(tenantId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const upstream = resolveTenantUpstream(config, tenantId);
  if (upstream === undefined) {
    return c.json({ error: "Tenant not found" }, 404);
  }
  const upstreamPath = tenantPathFromRequest(c.req.path, tenantId);
  if (upstreamPath === undefined) {
    return c.json({ error: "Bad path" }, 400);
  }
  const query = new URL(c.req.url).search;
  return forwardToUpstream(upstream, user.username, c.req.raw, `${upstreamPath}${query}`, deps);
}

export async function handleSingleModeProxy(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
  deps: ProxyDeps,
): Promise<Response> {
  const upstream = resolveDefaultUpstream(config);
  if (upstream === undefined) {
    return c.json({ error: "Upstream not configured" }, 503);
  }
  const url = new URL(c.req.url);
  const user = c.get("user");
  return forwardToUpstream(upstream, user.username, c.req.raw, `${url.pathname}${url.search}`, deps);
}
