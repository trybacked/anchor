import { zValidator } from "@hono/zod-validator";
import { validateTenantId } from "@trybacked/core";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { requireAdmin, requireInternal } from "./auth.js";
import type { ControlPlaneConfig } from "./config.js";
import {
  enqueueJob,
  getJob,
  getOrganizationByTenantId,
  insertOrganization,
  listActiveOrganizations,
  listOrganizations,
  listTenantsForWorkosOrganizations,
} from "./db/repositories.js";
import { buildTenantsRegistry } from "./registry-builder.js";

const CreateOrganizationSchema = z.object({
  tenantId: z.string().min(1),
  shared: z.array(z.string().min(1)).optional(),
  workosOrganizationId: z.string().min(1).optional(),
});

const ResolveTenantsSchema = z.object({
  workosOrganizationIds: z.array(z.string().min(1)),
});

export function createControlPlaneApp(config: ControlPlaneConfig, pool: pg.Pool): Hono {
  const app = new Hono();

  app.get("/health/live", (c) => c.json({ ok: true as const }));

  app.get("/v1/registry", requireInternal(config), async (c) => {
    const orgs = await listActiveOrganizations(pool);
    const registry = buildTenantsRegistry(config, orgs);
    const body = JSON.stringify(registry);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304, { ETag: etag });
    }
    return c.json(registry, 200, { ETag: etag });
  });

  app.post(
    "/v1/me/tenants",
    requireInternal(config),
    zValidator("json", ResolveTenantsSchema),
    async (c) => {
      const body = c.req.valid("json");
      const tenants = await listTenantsForWorkosOrganizations(pool, body.workosOrganizationIds);
      return c.json({ tenants });
    },
  );

  app.get("/v1/organizations", requireAdmin(config), async (c) => {
    const orgs = await listOrganizations(pool);
    return c.json({ organizations: orgs });
  });

  app.get("/v1/organizations/:tenantId", requireAdmin(config), async (c) => {
    const tenantId = c.req.param("tenantId") ?? "";
    if (tenantId.length === 0) {
      return c.json({ error: "Missing tenantId" }, 400);
    }
    const org = await getOrganizationByTenantId(pool, tenantId);
    if (org === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(org);
  });

  app.post(
    "/v1/organizations",
    requireAdmin(config),
    zValidator("json", CreateOrganizationSchema),
    async (c) => {
      const body = c.req.valid("json");
      try {
        validateTenantId(body.tenantId);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Invalid tenant id" },
          400,
        );
      }
      const existing = await getOrganizationByTenantId(pool, body.tenantId);
      if (existing !== undefined) {
        return c.json({ error: "Organization already exists" }, 409);
      }
      const shared = body.shared ?? ["anac"];
      const org = await insertOrganization(pool, {
        tenantId: body.tenantId,
        sharedSpaces: shared,
        workosOrganizationId: body.workosOrganizationId,
      });
      const job = await enqueueJob(pool, org.id, "create_tenant", { tenantId: body.tenantId, shared });
      return c.json({ organization: org, job }, 201);
    },
  );

  app.post("/v1/organizations/:tenantId/ontology/sync", requireAdmin(config), async (c) => {
    const tenantId = c.req.param("tenantId") ?? "";
    if (tenantId.length === 0) {
      return c.json({ error: "Missing tenantId" }, 400);
    }
    const org = await getOrganizationByTenantId(pool, tenantId);
    if (org === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    const job = await enqueueJob(pool, org.id, "sync_ontology", { tenantId });
    return c.json({ job }, 202);
  });

  app.get("/v1/jobs/:jobId", requireAdmin(config), async (c) => {
    const jobId = c.req.param("jobId") ?? "";
    if (jobId.length === 0) {
      return c.json({ error: "Missing jobId" }, 400);
    }
    const job = await getJob(pool, jobId);
    if (job === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(job);
  });

  return app;
}
