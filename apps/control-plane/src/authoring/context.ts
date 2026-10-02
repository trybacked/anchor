import type { Context, Next } from "hono";
import type { ControlPlaneConfig } from "../config.js";
import { getOrganizationByTenantId } from "../db/repositories.js";
import { resolveTenantRole } from "../db/ontology-repositories.js";
import type { TenantRole } from "@trybacked/core";
import type pg from "pg";

export type AuthoringVariables = {
  tenantId: string;
  username: string;
  workosRoles: string[];
  role: TenantRole;
  catalog: string;
};

function bearerToken(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length).trim();
}

export function requireAuthoringAccess(config: ControlPlaneConfig, pool: pg.Pool) {
  return async (c: Context, next: Next) => {
    const token = bearerToken(c);
    if (token !== config.internalToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const tenantId = c.req.param("tenantId");
    if (tenantId === undefined || tenantId.length === 0) {
      return c.json({ error: "Missing tenantId" }, 400);
    }
    const username = c.req.header("X-Backed-User")?.trim();
    if (username === undefined || username.length === 0) {
      return c.json({ error: "Missing X-Backed-User" }, 401);
    }
    const org = await getOrganizationByTenantId(pool, tenantId);
    if (org === undefined) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    const rolesHeader = c.req.header("X-Backed-Roles")?.trim();
    const workosRoles =
      rolesHeader !== undefined && rolesHeader.length > 0
        ? rolesHeader.split(",").map((role) => role.trim()).filter((role) => role.length > 0)
        : [];
    const role = await resolveTenantRole(pool, tenantId, username, workosRoles);
    (c as Context<{ Variables: { authoring: AuthoringVariables } }>).set("authoring", {
      tenantId,
      username,
      workosRoles,
      role,
      catalog: org.catalog,
    });
    return next();
  };
}

export function requireAuthoringRole(minimum: TenantRole) {
  const rank: Record<TenantRole, number> = {
    viewer: 0,
    editor: 1,
    publisher: 2,
    admin: 3,
  };
  return async (c: Context, next: Next) => {
    const ctx = (c as Context<{ Variables: { authoring: AuthoringVariables } }>).get("authoring");
    if (ctx === undefined) {
      return c.json({ error: "Authoring context missing" }, 500);
    }
    if (rank[ctx.role] < rank[minimum]) {
      return c.json({ error: "Forbidden", requiredRole: minimum }, 403);
    }
    return next();
  };
}

export function getAuthoring(c: Context): AuthoringVariables {
  return (c as Context<{ Variables: { authoring: AuthoringVariables } }>).get("authoring");
}
