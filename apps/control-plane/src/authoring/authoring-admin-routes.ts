import { zValidator } from "@hono/zod-validator";
import { PutMemberBodySchema } from "@trybacked/core";
import { createDatasetProviderFromEnv } from "@trybacked/infrastructure";
import type { Hono } from "hono";
import {
  deleteRoleBinding,
  listDerivedDatasets,
  listRoleBindings,
  upsertRoleBinding,
} from "../db/ontology-repositories.js";
import { getJob } from "../db/repositories.js";
import type { AuthoringEnv, AuthoringRouteDeps } from "./authoring-types.js";
import { getAuthoring, requireAuthoringRole } from "./context.js";

export function registerAuthoringAdminRoutes(
  authoring: Hono<AuthoringEnv>,
  deps: AuthoringRouteDeps,
): void {
  const { config, pool } = deps;

  authoring.get("/jobs/:jobId", requireAuthoringRole("viewer"), async (c) => {
    const jobId = c.req.param("jobId") ?? "";
    const job = await getJob(pool, jobId);
    if (job === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      id: job.id,
      kind: job.kind,
      status: job.status,
      error: job.error,
      result: job.result,
    });
  });
  authoring.get("/members", requireAuthoringRole("admin"), async (c) => {
    const ctx = getAuthoring(c);
    const bindings = await listRoleBindings(pool, ctx.tenantId);
    return c.json({ members: bindings });
  });
  authoring.put(
    "/members",
    requireAuthoringRole("admin"),
    zValidator("json", PutMemberBodySchema),
    async (c) => {
      const ctx = getAuthoring(c);
      const body = c.req.valid("json");
      await upsertRoleBinding(pool, {
        tenant_id: ctx.tenantId,
        subject_type: body.subjectType,
        subject: body.subject,
        role: body.role,
      });
      return c.json({ ok: true as const });
    },
  );
  authoring.delete("/members/:subjectType/:subject", requireAuthoringRole("admin"), async (c) => {
    const ctx = getAuthoring(c);
    const subjectType = c.req.param("subjectType") ?? "";
    const subjectParam = c.req.param("subject") ?? "";
    const subject = decodeURIComponent(subjectParam);
    const deleted = await deleteRoleBinding(pool, ctx.tenantId, subjectType, subject);
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true as const });
  });
  authoring.get("/sources/collections", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const provider = createDatasetProviderFromEnv(
      { ...process.env, BACKED_FILES_ROOT: config.filesRoot },
      { tenantId: ctx.tenantId },
    );
    const datasets = await provider.listDatasets();
    return c.json({
      collections: await Promise.all(
        datasets.map(async (dataset) => {
          const metadata = await provider.getMetadata(dataset);
          return {
            id: dataset.id,
            fileCount: metadata.rowCount ?? 0,
          };
        }),
      ),
    });
  });
  authoring.post("/datasets", requireAuthoringRole("publisher"), (c) => {
    return c.json(
      {
        error: "not_available",
        message:
          "Derived SQL datasets require a warehouse engine. The files engine does not support this yet.",
      },
      501,
    );
  });
  authoring.get("/datasets", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const rows = await listDerivedDatasets(pool, ctx.tenantId);
    return c.json({
      datasets: rows.map((row) => ({
        name: row.name,
        schema: row.schema_name,
        sql: row.sql,
        status: row.status,
        lastError: row.last_error,
        createdBy: row.created_by,
      })),
    });
  });
}
