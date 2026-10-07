import { Hono } from "hono";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  TenantSettingsSchema,
  TenantSourceSchema,
  getTenantProfile,
  putTenantSettings,
  upsertTenantSource,
} from "../db/tenant-profile-repositories.js";
import {
  requireAuthoringAccess,
  requireAuthoringRole,
  type AuthoringVariables,
} from "./context.js";

/** Tenant profile routes (Plan Phase 2): configuration as data. */
export function registerTenantProfileRoutes(
  app: Hono,
  config: ControlPlaneConfig,
  pool: pg.Pool,
): void {
  const profile = new Hono<{ Variables: { authoring: AuthoringVariables } }>();
  profile.use("*", requireAuthoringAccess(config, pool));

  profile.get("/", requireAuthoringRole("viewer"), async (c) => {
    const tenantId = c.req.param("tenantId") ?? "";
    return c.json(await getTenantProfile(pool, tenantId));
  });

  profile.put("/settings", requireAuthoringRole("editor"), async (c) => {
    const tenantId = c.req.param("tenantId") ?? "";
    const parsed = TenantSettingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid settings", issues: parsed.error.issues }, 400);
    }
    await putTenantSettings(pool, tenantId, parsed.data);
    return c.json(await getTenantProfile(pool, tenantId));
  });

  profile.put("/sources/:sourceId", requireAuthoringRole("editor"), async (c) => {
    const tenantId = c.req.param("tenantId") ?? "";
    const sourceId = c.req.param("sourceId") ?? "";
    const parsed = TenantSourceSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "Invalid source", issues: parsed.error.issues }, 400);
    }
    await upsertTenantSource(pool, tenantId, { ...parsed.data, sourceId });
    return c.json(await getTenantProfile(pool, tenantId));
  });

  app.route("/v1/tenants/:tenantId/profile", profile);
}
