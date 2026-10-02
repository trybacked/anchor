import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { GatewayConfig } from "./config.js";
import type { GatewayVariables } from "./types.js";

export const SESSION_COOKIE_NAME = "backed_session";
export const OAUTH_STATE_COOKIE = "backed_oauth_state";
export const OAUTH_RETURN_COOKIE = "backed_oauth_return";
export const OAUTH_PENDING_COOKIE = "backed_oauth_app_pending";

const OAUTH_COOKIE_TTL_SECONDS = 600;

type GatewayContext = Context<{ Variables: GatewayVariables }>;

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
  name: typeof OAUTH_STATE_COOKIE | typeof OAUTH_RETURN_COOKIE | typeof OAUTH_PENDING_COOKIE,
  value: string,
): void {
  setCookie(c, name, value, writeOptions(config, OAUTH_COOKIE_TTL_SECONDS));
}

export function clearOAuthFlowCookies(c: GatewayContext, config: GatewayConfig): void {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_RETURN_COOKIE, OAUTH_PENDING_COOKIE]) {
    deleteCookie(c, name, { path: "/", secure: config.cookieSecure });
  }
}

export function clearSessionCookies(c: GatewayContext, config: GatewayConfig): void {
  for (const name of [
    SESSION_COOKIE_NAME,
    OAUTH_STATE_COOKIE,
    OAUTH_RETURN_COOKIE,
    OAUTH_PENDING_COOKIE,
  ]) {
    deleteCookie(c, name, { path: "/", secure: config.cookieSecure });
  }
}
