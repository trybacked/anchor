import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import { SESSION_COOKIE_NAME } from "./session.js";
import type { GatewayVariables } from "./types.js";

const OAUTH_STATE_COOKIE = "backed_oauth_state";
const OAUTH_RETURN_COOKIE = "backed_oauth_return";

function cookieClearOptions(config: GatewayConfig): {
  path: string;
  secure: boolean;
  sameSite: "Lax" | "Strict";
} {
  return {
    path: "/",
    secure: config.cookieSecure,
    sameSite: config.authMode === "workos" ? "Lax" : "Strict",
  };
}

export function clearGatewaySessionCookies(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
): void {
  const options = cookieClearOptions(config);
  deleteCookie(c, SESSION_COOKIE_NAME, options);
  deleteCookie(c, OAUTH_STATE_COOKIE, options);
  deleteCookie(c, OAUTH_RETURN_COOKIE, options);
}

export function handleLogout(
  c: Context<{ Variables: GatewayVariables }>,
  config: GatewayConfig,
): Response {
  clearGatewaySessionCookies(c, config);
  const accept = c.req.header("Accept") ?? "";
  if (c.req.method === "GET" || accept.includes("text/html")) {
    return c.redirect("/login");
  }
  return c.json({ ok: true as const });
}
