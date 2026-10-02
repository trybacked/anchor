import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";
import { verifySessionToken } from "./session.js";
import type { GatewayVariables } from "./types.js";

function bearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export function createRequireAuthMiddleware(config: GatewayConfig): MiddlewareHandler<{
  Variables: GatewayVariables;
}> {
  return async (c, next) => {
    const headerToken = bearerToken(c.req.header("Authorization"));
    const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
    const token = headerToken ?? cookieToken;
    if (token === undefined || token.length === 0) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const user = await verifySessionToken(config.sessionSecret, token);
    if (user === undefined) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("user", user);
    return next();
  };
}
