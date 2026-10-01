import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";

export const SESSION_COOKIE_NAME = "backed_session";
export const OAUTH_STATE_COOKIE = "backed_oauth_state";
export const OAUTH_RETURN_COOKIE = "backed_oauth_return";

const OAUTH_COOKIE_TTL_SECONDS = 600;

type GatewayContext = Context<{ Variables: GatewayVariables }>;

/**
 * `Lax` rather than `Strict`: the WorkOS callback is a cross-site redirect back to the gateway,
 * and `Strict` makes the browser withhold the cookie on that navigation.
 */
function writeOptions(config: GatewayConfig, maxAge: number) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge,
  };
}

export function setSessionCookie(c: GatewayContext, config: GatewayConfig, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, writeOptions(config, config.sessionTtlSeconds));
}

export function setOAuthCookie(
  c: GatewayContext,
  config: GatewayConfig,
  name: typeof OAUTH_STATE_COOKIE | typeof OAUTH_RETURN_COOKIE,
  value: string,
): void {
  setCookie(c, name, value, writeOptions(config, OAUTH_COOKIE_TTL_SECONDS));
}

/** Browsers match deletions on name, domain, and path only, so `sameSite` is irrelevant here. */
export function clearSessionCookies(c: GatewayContext, config: GatewayConfig): void {
  for (const name of [SESSION_COOKIE_NAME, OAUTH_STATE_COOKIE, OAUTH_RETURN_COOKIE]) {
    deleteCookie(c, name, { path: "/", secure: config.cookieSecure });
  }
}
