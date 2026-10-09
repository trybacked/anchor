import { zValidator } from "@hono/zod-validator";
import {
  ApplyCommandsBodySchema,
  AuthoringCommandSchema,
  ImportOntologyBodySchema,
  PublishOntologyBodySchema,
} from "@trybacked/core";
import {
  applyCommands,
  AuthoringCommandError,
  diffSemanticModels,
  emptySemanticModel,
} from "@trybacked/ontology-authoring";
import type { Hono } from "hono";
import { z } from "zod";
import {
  getAuthoringPack,
  listAuthoringPacks,
  upsertAuthoringPack,
} from "../db/authoring-pack-repositories.js";
import {
  applyDraftCommandsTx,
  getLatestOntologyVersion,
  getOntologyVersion,
  listOntologyChanges,
  listOntologyVersions,
  upsertOntologyDraft,
} from "../db/ontology-repositories.js";
import { enqueueJob, getOrganizationByTenantId } from "../db/repositories.js";
import { exportDraftYaml } from "../jobs/publish-ontology.js";
import type { AuthoringEnv, AuthoringRouteDeps } from "./authoring-types.js";
import { getAuthoring, requireAuthoringRole } from "./context.js";
import {
  ensureOntologyDraft,
  importModelContent,
  resolvePublishedModelForDraftReset,
  validateDraftModel,
} from "./draft-service.js";

export function registerOntologyRoutes(
  authoring: Hono<AuthoringEnv>,
  deps: AuthoringRouteDeps,
): void {
  const { config, pool } = deps;

  authoring.get("/ontology/draft", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
    c.header("ETag", `"${String(draft.revision)}"`);
    return c.json({
      revision: draft.revision,
      basedOnVersion: draft.based_on_version,
      model: draft.model,
      updatedBy: draft.updated_by,
      updatedAt: draft.updated_at.toISOString(),
    });
  });
  authoring.post(
    "/ontology/draft/commands",
    requireAuthoringRole("editor"),
    zValidator("json", ApplyCommandsBodySchema),
    async (c) => {
      const ctx = getAuthoring(c);
      const body = c.req.valid("json");
      const ifMatch = c.req.header("If-Match")?.replace(/^"|"$/g, "");
      const expectedRevision =
        ifMatch !== undefined && ifMatch.length > 0 ? Number.parseInt(ifMatch, 10) : undefined;
      if (expectedRevision === undefined || !Number.isFinite(expectedRevision)) {
        return c.json({ error: "If-Match revision header required" }, 428);
      }
      const draft = await ensureOntologyDraft(
        pool,
        ctx.tenantId,
        ctx.catalog,
        config,
        ctx.username,
      );
      if (draft.revision !== expectedRevision) {
        return c.json({ error: "revision_conflict", revision: draft.revision }, 409);
      }
      let nextModel = draft.model;
      try {
        nextModel = applyCommands(draft.model, body.commands);
      } catch (error) {
        const message = error instanceof AuthoringCommandError ? error.message : String(error);
        return c.json({ error: message }, 400);
      }
      const applied = await applyDraftCommandsTx(pool, {
        tenantId: ctx.tenantId,
        expectedRevision,
        nextModel,
        commands: body.commands,
        actor: ctx.username,
      });
      if (applied === "revision_conflict") {
        return c.json({ error: "revision_conflict" }, 409);
      }
      const validation = validateDraftModel(applied.model, ctx.tenantId);
      return c.json({
        revision: applied.revision,
        model: applied.model,
        validation: {
          valid: validation.valid,
          issues: validation.issues,
        },
      });
    },
  );
  authoring.get("/ontology/draft/validate", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
    const validation = validateDraftModel(draft.model, ctx.tenantId);
    return c.json({ valid: validation.valid, issues: validation.issues });
  });
  authoring.get("/ontology/draft/diff", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const against = c.req.query("against") ?? "published";
    const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
    let baseline = draft.model;
    if (against === "published") {
      const version = await getLatestOntologyVersion(pool, ctx.tenantId);
      if (version > 0) {
        const published = await getOntologyVersion(pool, ctx.tenantId, version);
        if (published !== undefined) {
          baseline = published.model;
        }
      } else {
        baseline = { ...draft.model, entities: [], relations: [], rules: [] };
      }
      return c.json({ changes: diffSemanticModels(baseline, draft.model) });
    }
    return c.json({ error: "Unsupported against parameter" }, 400);
  });
  authoring.post("/ontology/draft/reset", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const published = await resolvePublishedModelForDraftReset(
      pool,
      ctx.tenantId,
      ctx.catalog,
      config,
    );
    if (published === undefined) {
      return c.json({ error: "No published version to reset from" }, 404);
    }
    const draft = await upsertOntologyDraft(pool, {
      tenantId: ctx.tenantId,
      revision:
        (await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username))
          .revision + 1,
      model: published.model,
      basedOnVersion: published.version,
      updatedBy: ctx.username,
    });
    return c.json({
      revision: draft.revision,
      basedOnVersion: draft.based_on_version,
      model: draft.model,
    });
  });
  authoring.post(
    "/ontology/publish",
    requireAuthoringRole("publisher"),
    zValidator("json", PublishOntologyBodySchema),
    async (c) => {
      const ctx = getAuthoring(c);
      const body = c.req.valid("json");
      const org = await getOrganizationByTenantId(pool, ctx.tenantId);
      if (org === undefined) {
        return c.json({ error: "Tenant not found" }, 404);
      }
      await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
      const job = await enqueueJob(pool, org.id, "publish_ontology", {
        tenantId: ctx.tenantId,
        catalog: org.catalog,
        actor: ctx.username,
        notes: body.notes,
      });
      return c.json({ jobId: job.id }, 202);
    },
  );
  authoring.get("/ontology/versions", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const versions = await listOntologyVersions(pool, ctx.tenantId);
    return c.json({
      versions: versions.map((row) => ({
        version: row.version,
        publishedAt: row.published_at.toISOString(),
        publishedBy: row.published_by,
        notes: row.notes,
      })),
    });
  });
  authoring.get("/ontology/versions/:version", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const version = Number.parseInt(c.req.param("version") ?? "", 10);
    if (!Number.isFinite(version)) {
      return c.json({ error: "Invalid version" }, 400);
    }
    const row = await getOntologyVersion(pool, ctx.tenantId, version);
    if (row === undefined) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      version: row.version,
      publishedAt: row.published_at.toISOString(),
      publishedBy: row.published_by,
      notes: row.notes,
      model: row.model,
    });
  });
  authoring.post(
    "/ontology/versions/:version/rollback",
    requireAuthoringRole("publisher"),
    async (c) => {
      const ctx = getAuthoring(c);
      const version = Number.parseInt(c.req.param("version") ?? "", 10);
      const row = await getOntologyVersion(pool, ctx.tenantId, version);
      if (row === undefined) {
        return c.json({ error: "Not found" }, 404);
      }
      const draft = await ensureOntologyDraft(
        pool,
        ctx.tenantId,
        ctx.catalog,
        config,
        ctx.username,
      );
      await upsertOntologyDraft(pool, {
        tenantId: ctx.tenantId,
        revision: draft.revision + 1,
        model: row.model,
        basedOnVersion: version,
        updatedBy: ctx.username,
      });
      const org = await getOrganizationByTenantId(pool, ctx.tenantId);
      if (org === undefined) {
        return c.json({ error: "Tenant not found" }, 404);
      }
      const job = await enqueueJob(pool, org.id, "publish_ontology", {
        tenantId: ctx.tenantId,
        catalog: org.catalog,
        actor: ctx.username,
        notes: `Rollback to v${String(version)}`,
        method: "rollback",
        derivedFromVersion: version,
      });
      return c.json({ jobId: job.id }, 202);
    },
  );
  authoring.post(
    "/ontology/import",
    requireAuthoringRole("editor"),
    zValidator("json", ImportOntologyBodySchema),
    async (c) => {
      const ctx = getAuthoring(c);
      const body = c.req.valid("json");
      let model;
      try {
        model = importModelContent(body.format, body.content);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      const draft = await ensureOntologyDraft(
        pool,
        ctx.tenantId,
        ctx.catalog,
        config,
        ctx.username,
      );
      const updated = await upsertOntologyDraft(pool, {
        tenantId: ctx.tenantId,
        revision: draft.revision + 1,
        model,
        basedOnVersion: draft.based_on_version,
        updatedBy: ctx.username,
      });
      return c.json({ revision: updated.revision, model: updated.model });
    },
  );
  authoring.get("/ontology/export", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const format = c.req.query("format") === "yaml" ? "yaml" : "json";
    const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
    if (format === "yaml") {
      return c.text(exportDraftYaml(draft.model), 200, {
        "Content-Type": "text/yaml; charset=utf-8",
      });
    }
    return c.json(draft.model);
  });
  authoring.get("/ontology/packs", requireAuthoringRole("viewer"), async (c) => {
    const packs = await listAuthoringPacks(pool);
    return c.json({
      packs: packs.map((pack) => ({
        id: pack.id,
        name: pack.name,
        description: pack.description,
      })),
    });
  });
  authoring.put(
    "/ontology/packs/:packId",
    requireAuthoringRole("publisher"),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        commands: z.array(z.unknown()),
      }),
    ),
    async (c) => {
      const packId = c.req.param("packId");
      if (packId.length === 0) {
        return c.json({ error: "Missing packId" }, 400);
      }
      const body = c.req.valid("json");
      const pack = await upsertAuthoringPack(pool, {
        id: packId,
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        commands: body.commands,
      });
      return c.json({ id: pack.id, name: pack.name }, 201);
    },
  );
  authoring.post("/ontology/draft/packs/:packId", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const packId = c.req.param("packId") ?? "";
    if (packId.length === 0) {
      return c.json({ error: "Missing packId" }, 400);
    }
    const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.catalog, config, ctx.username);
    const ifMatch = c.req.header("If-Match")?.replace(/^"|"$/g, "");
    const expectedRevision =
      ifMatch !== undefined && ifMatch.length > 0 ? Number.parseInt(ifMatch, 10) : draft.revision;
    const replace = c.req.query("replace") === "true";
    const pack = await getAuthoringPack(pool, packId);
    if (pack === undefined) {
      return c.json({ error: `Unknown pack "${packId}"` }, 404);
    }
    const commands = AuthoringCommandSchema.array().parse(pack.commands);
    let nextModel;
    try {
      nextModel = replace
        ? applyCommands(emptySemanticModel(`pack-${packId}-${ctx.tenantId}`), commands)
        : applyCommands(draft.model, commands);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
    const applied = await applyDraftCommandsTx(pool, {
      tenantId: ctx.tenantId,
      expectedRevision,
      nextModel,
      commands,
      actor: ctx.username,
    });
    if (applied === "revision_conflict") {
      return c.json({ error: "revision_conflict" }, 409);
    }
    return c.json({
      revision: applied.revision,
      model: applied.model,
      validation: validateDraftModel(applied.model, ctx.tenantId),
    });
  });
  authoring.get("/ontology/changes", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10), 200);
    const changes = await listOntologyChanges(pool, ctx.tenantId, limit);
    return c.json({ changes });
  });
}
