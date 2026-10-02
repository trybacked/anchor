import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";
import { verifySessionToken } from "./session.js";
import type { GatewayVariables } from "./types.js";

export function createRequireAuthMiddleware(config: GatewayConfig): MiddlewareHandler<{
  Variables: GatewayVariables;
}> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
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
