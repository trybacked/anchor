import { zValidator } from "@hono/zod-validator";
import { validateTenantId } from "@trybacked/core";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { requireAdmin, requireInternal } from "./auth.js";
import { registerAiProposalRoutes } from "./authoring/ai-proposal-routes.js";
import { registerAuthoringRoutes } from "./authoring/routes.js";
import { registerTenantProfileRoutes } from "./authoring/tenant-profile-routes.js";
import type { ControlPlaneConfig } from "./config.js";
import {
  deleteOAuthClient,
  enqueueJob,
  getJob,
  getOAuthClientById,
  getOrganizationByTenantId,
  insertOAuthClient,
  insertOrganization,
  listActiveOrganizations,
  listOAuthClients,
  listOrganizations,
  listTenantsForWorkosOrganizations,
  patchOAuthClient,
  updateOrganizationWorkosId,
} from "./db/repositories.js";
import { generateClientSecret, hashClientSecret } from "./oauth-client-secret.js";
import { buildTenantsRegistry } from "./registry-builder.js";
import { registerSemanticRoutes } from "./semantic/routes.js";
const CreateOrganizationSchema = z.object({
  tenantId: z.string().min(1),
  catalog: z.string().min(1),
  shared: z.array(z.string().min(1)).optional(),
  workosOrganizationId: z.string().min(1).optional(),
});
const ResolveTenantsSchema = z.object({
  workosOrganizationIds: z.array(z.string().min(1)),
});
const PatchOrganizationWorkosSchema = z.object({
  workosOrganizationId: z.string().min(1),
});
const ClientIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const CreateOAuthClientSchema = z.object({
  clientId: ClientIdSchema,
  name: z.string().min(1).max(128),
  redirectUris: z.array(z.string().url()).min(1),
  corsOrigins: z.array(z.string().url()).optional(),
  confidential: z.boolean().optional(),
});
const PatchOAuthClientSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    redirectUris: z.array(z.string().url()).min(1).optional(),
    corsOrigins: z.array(z.string().url()).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined || body.redirectUris !== undefined || body.corsOrigins !== undefined,
    {
      message: "At least one field is required",
    },
  );
function toPublicOAuthClient(row: Awaited<ReturnType<typeof getOAuthClientById>>) {
  if (row === undefined) {
    return undefined;
  }
  return {
    clientId: row.client_id,
    name: row.name,
    redirectUris: row.redirect_uris,
    corsOrigins: row.cors_origins,
    public: row.client_secret_hash === null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function toInternalOAuthClient(row: NonNullable<Awaited<ReturnType<typeof getOAuthClientById>>>) {
  return {
    ...toPublicOAuthClient(row),
    clientSecretHash: row.client_secret_hash,
  };
}
function oauthClientIdFromPath(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}
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
    const tenantId = c.req.param("tenantId");
    if (tenantId === undefined) {
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
        return c.json({ error: error instanceof Error ? error.message : "Invalid tenant id" }, 400);
      }
      const existing = await getOrganizationByTenantId(pool, body.tenantId);
      if (existing !== undefined) {
        return c.json({ error: "Organization already exists" }, 409);
      }
      const shared = body.shared ?? config.defaultSharedSpaces;
      const org = await insertOrganization(pool, {
        tenantId: body.tenantId,
        catalog: body.catalog,
        sharedSpaces: shared,
        workosOrganizationId: body.workosOrganizationId,
      });
      const job = await enqueueJob(pool, org.id, "create_tenant", {
        tenantId: body.tenantId,
        shared,
      });
      return c.json({ organization: org, job }, 201);
    },
  );
  app.patch(
    "/v1/organizations/:tenantId/workos",
    requireAdmin(config),
    zValidator("json", PatchOrganizationWorkosSchema),
    async (c) => {
      const body = c.req.valid("json");
      const org = await updateOrganizationWorkosId(
        pool,
        c.req.param("tenantId"),
        body.workosOrganizationId,
      );
      if (org === undefined) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json(org);
    },
  );
  app.post("/v1/organizations/:tenantId/ontology/sync", requireAdmin(config), async (c) => {
    const tenantId = c.req.param("tenantId");
    if (tenantId === undefined) {
      return c.json({ error: "Missing tenantId" }, 400);
    }
    const org = await getOrganizationByTenantId(pool, tenantId);
    if (org === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    const job = await enqueueJob(pool, org.id, "publish_ontology", {
      tenantId,
      catalog: org.catalog,
      actor: "admin-sync",
    });
    return c.json({ job }, 202);
  });
  registerAuthoringRoutes(app, config, pool);
  registerTenantProfileRoutes(app, config, pool);
  registerAiProposalRoutes(app, config, pool);
  registerSemanticRoutes(app, config, pool);
  app.get("/v1/jobs/:jobId", requireAdmin(config), async (c) => {
    const jobId = c.req.param("jobId");
    if (jobId === undefined) {
      return c.json({ error: "Missing jobId" }, 400);
    }
    const job = await getJob(pool, jobId);
    if (job === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(job);
  });
  app.get("/v1/oauth-clients", requireInternal(config), async (c) => {
    const rows = await listOAuthClients(pool);
    const body = JSON.stringify({
      clients: rows.map((row) => toInternalOAuthClient(row)),
    });
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch === etag) {
      return c.body(null, 304, { ETag: etag });
    }
    return c.body(body, 200, {
      "Content-Type": "application/json",
      ETag: etag,
    });
  });
  app.get("/v1/oauth-clients/:clientId", requireInternal(config), async (c) => {
    const clientId = oauthClientIdFromPath(c.req.param("clientId"));
    if (clientId === undefined) {
      return c.json({ error: "Missing clientId" }, 400);
    }
    const row = await getOAuthClientById(pool, clientId);
    if (row === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(toInternalOAuthClient(row));
  });
  app.get("/v1/admin/oauth-clients", requireAdmin(config), async (c) => {
    const rows = await listOAuthClients(pool);
    return c.json({ clients: rows.map((row) => toPublicOAuthClient(row)) });
  });
  app.post(
    "/v1/admin/oauth-clients",
    requireAdmin(config),
    zValidator("json", CreateOAuthClientSchema),
    async (c) => {
      const body = c.req.valid("json");
      const existing = await getOAuthClientById(pool, body.clientId);
      if (existing !== undefined) {
        return c.json({ error: "OAuth client already exists" }, 409);
      }
      const confidential = body.confidential === true;
      const plainSecret = confidential ? generateClientSecret() : undefined;
      const clientSecretHash =
        plainSecret !== undefined ? hashClientSecret(plainSecret, config.internalToken) : null;
      const corsOrigins = body.corsOrigins ?? body.redirectUris.map((uri) => new URL(uri).origin);
      const row = await insertOAuthClient(pool, {
        clientId: body.clientId,
        name: body.name,
        redirectUris: body.redirectUris,
        corsOrigins,
        clientSecretHash,
      });
      return c.json(
        {
          client: toPublicOAuthClient(row),
          ...(plainSecret !== undefined ? { clientSecret: plainSecret } : {}),
        },
        201,
      );
    },
  );
  app.patch(
    "/v1/admin/oauth-clients/:clientId",
    requireAdmin(config),
    zValidator("json", PatchOAuthClientSchema),
    async (c) => {
      const body = c.req.valid("json");
      const clientId = oauthClientIdFromPath(c.req.param("clientId"));
      if (clientId === undefined) {
        return c.json({ error: "Missing clientId" }, 400);
      }
      const row = await patchOAuthClient(pool, clientId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.redirectUris !== undefined ? { redirectUris: body.redirectUris } : {}),
        ...(body.corsOrigins !== undefined ? { corsOrigins: body.corsOrigins } : {}),
      });
      if (row === undefined) {
        return c.json({ error: "Not found" }, 404);
      }
      return c.json({ client: toPublicOAuthClient(row) });
    },
  );
  app.delete("/v1/admin/oauth-clients/:clientId", requireAdmin(config), async (c) => {
    const clientId = oauthClientIdFromPath(c.req.param("clientId"));
    if (clientId === undefined) {
      return c.json({ error: "Missing clientId" }, 400);
    }
    const deleted = await deleteOAuthClient(pool, clientId);
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true as const });
  });
  return app;
}
