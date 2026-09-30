import { sign, verify } from "hono/jwt";
import type { GatewaySessionPayload, GatewayUser } from "./types.js";

export const SESSION_COOKIE_NAME = "backed_session";

export async function createSessionToken(
  secret: string,
  user: { username: string; tenants: string[] },
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: GatewaySessionPayload = {
    sub: user.username,
    tenants: user.tenants,
    exp,
  };
  return sign(payload, secret, "HS256");
}

export async function verifySessionToken(
  secret: string,
  token: string,
): Promise<GatewayUser | undefined> {
  try {
    const payload = await verify(token, secret, "HS256");
    if (typeof payload !== "object") {
      return undefined;
    }
    const sub = "sub" in payload && typeof payload.sub === "string" ? payload.sub : undefined;
    const tenantsRaw = "tenants" in payload ? payload.tenants : undefined;
    if (sub === undefined) {
      return undefined;
    }
    const tenants = Array.isArray(tenantsRaw)
      ? tenantsRaw.filter((value): value is string => typeof value === "string")
      : [];
    return { username: sub, tenants };
  } catch {
    return undefined;
  }
}
