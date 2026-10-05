import type { MiddlewareHandler } from "hono";
import type { GatewayConfig } from "./config.js";
import { collectCorsOrigins, listRegisteredOAuthClients } from "./oauth-client-store.js";
import type { GatewayVariables } from "./types.js";
const CORS_PATH_PREFIXES = ["/me", "/logout", "/oauth/", "/t/"];
function pathAllowsCors(pathname: string): boolean {
  return CORS_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix,
  );
}
export function createOAuthCorsMiddleware(config: GatewayConfig): MiddlewareHandler<{
  Variables: GatewayVariables;
}> {
  return async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin === undefined || origin.length === 0) {
      return next();
    }
    if (!pathAllowsCors(new URL(c.req.url).pathname)) {
      return next();
    }
    const clients = await listRegisteredOAuthClients(config);
    const allowed = collectCorsOrigins(clients);
    if (!allowed.has(origin)) {
      if (c.req.method === "OPTIONS") {
        return c.body(null, 403);
      }
      return next();
    }
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
    if (c.req.method === "OPTIONS") {
      const requestMethod = c.req.header("Access-Control-Request-Method") ?? "GET";
      const requestHeaders =
        c.req.header("Access-Control-Request-Headers") ?? "Authorization, Content-Type, Accept";
      c.header("Access-Control-Allow-Methods", requestMethod);
      c.header("Access-Control-Allow-Headers", requestHeaders);
      c.header("Access-Control-Max-Age", "86400");
      return c.body(null, 204);
    }
    return next();
  };
}
