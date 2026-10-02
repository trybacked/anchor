import type { TenantRole } from "@trybacked/core";
import { sign, verify } from "hono/jwt";
import type { GatewaySessionPayload, GatewayUser } from "./types.js";

export async function createSessionToken(
  secret: string,
  user: {
    username: string;
    tenants: string[];
    roles?: Record<string, TenantRole> | undefined;
    workosRoles?: string[] | undefined;
  },
  ttlSeconds: number,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: GatewaySessionPayload = {
    sub: user.username,
    tenants: user.tenants,
    ...(user.roles !== undefined ? { roles: user.roles } : {}),
    ...(user.workosRoles !== undefined ? { workosRoles: user.workosRoles } : {}),
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
    const rolesRaw = "roles" in payload ? payload.roles : undefined;
    const workosRolesRaw = "workosRoles" in payload ? payload.workosRoles : undefined;
    const roles =
      rolesRaw !== undefined && typeof rolesRaw === "object" && rolesRaw !== null
        ? (rolesRaw as Record<string, TenantRole>)
        : undefined;
    const workosRoles = Array.isArray(workosRolesRaw)
      ? workosRolesRaw.filter((value): value is string => typeof value === "string")
      : undefined;
    return {
      username: sub,
      tenants,
      ...(roles !== undefined ? { roles } : {}),
      ...(workosRoles !== undefined ? { workosRoles } : {}),
    };
  } catch {
    return undefined;
  }
}
