import { zValidator } from "@hono/zod-validator";
import {
  ApplyDiscoveryReviewBodySchema,
  createRunId,
  DiscoverDocsProposalBodySchema,
} from "@trybacked/core";
import { AuthoringCommandError } from "@trybacked/ontology-authoring";
import { createDatabricksDatasetProvider, createDatabricksSqlClient } from "@trybacked/provider-databricks";
import { Hono } from "hono";
import type pg from "pg";
import type { ControlPlaneConfig } from "../config.js";
import {
  getOntologyDiscoveryRun,
  insertOntologyDiscoveryRun,
  listOntologyDiscoveryRuns,
  markOntologyDiscoveryRunApplied,
  type OntologyDiscoveryRunRow,
} from "../db/discovery-repositories.js";
import { applyDraftCommandsTx } from "../db/ontology-repositories.js";
import {
  applyAuthoringCommandBatches,
  buildDiscoveryReviewCommands,
  proposeDocsAiWarehouseDiscovery,
  proposeDocsWarehouseDiscovery,
} from "./discovery-service.js";
import {
  getAuthoring,
  requireAuthoringAccess,
  requireAuthoringRole,
  type AuthoringVariables,
} from "./context.js";
import { ensureOntologyDraft, validateDraftModel } from "./draft-service.js";

const DOCS_SCHEMA = "docs";
const LIST_RUNS_LIMIT = 30;

type AuthoringEnv = {
  Variables: {
    authoring: AuthoringVariables;
  };
};

function runSummary(row: OntologyDiscoveryRunRow) {
  const kind =
    row.kind === "docs_warehouse_ai" ? ("docs_warehouse_ai" as const) : ("docs_warehouse" as const);
  return {
    runId: row.id,
    kind,
    catalog: row.catalog,
    schema: row.schema_name,
    missingTables: row.missing_tables,
    emptyTables: row.empty_tables,
    entityCount: row.proposal.entities.length,
    relationCount: row.proposal.relations.length,
    questionCount: row.proposal.questions.length,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    appliedAt: row.applied_at?.toISOString() ?? null,
    appliedRevision: row.applied_revision,
  };
}

function databricksProvider(config: ControlPlaneConfig, catalog: string) {
  const host = config.databricksHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const databricksConfig = {
    host,
    token: config.databricksToken,
    warehouseId: config.databricksWarehouseId,
    catalog,
    schema: DOCS_SCHEMA,
  };
  const client = createDatabricksSqlClient(databricksConfig);
  return createDatabricksDatasetProvider({ config: databricksConfig, client });
}

function warehouseErrorResponse(error: unknown): { status: 502; body: Record<string, string> } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 502,
    body: {
      error: "warehouse_unavailable",
      message,
    },
  };
}

export function registerDiscoveryRoutes(
  app: Hono,
  config: ControlPlaneConfig,
  pool: pg.Pool,
): void {
  const base = "/v1/tenants/:tenantId/authoring/discovery";
  const discovery = new Hono<AuthoringEnv>();
  discovery.use("*", requireAuthoringAccess(config, pool));

  discovery.post("/docs/propose", requireAuthoringRole("editor"), async (c) => {
      const ctx = getAuthoring(c);
      const raw: unknown = await c.req.json().catch(() => ({}));
      const parsedBody = DiscoverDocsProposalBodySchema.safeParse(raw);
      if (!parsedBody.success) {
        return c.json({ error: "invalid_body", issues: parsedBody.error.flatten() }, 400);
      }
      const body = parsedBody.data;
      const runId = createRunId();
      let provider;
      try {
        provider = databricksProvider(config, ctx.catalog);
      } catch (error) {
        const err = warehouseErrorResponse(error);
        return c.json(err.body, err.status);
      }
      let outcome;
      try {
        outcome = await proposeDocsWarehouseDiscovery(provider, {
          tenantId: ctx.tenantId,
          catalog: ctx.catalog,
          runId,
          ...(body.reviewConfidenceThreshold !== undefined
            ? { reviewConfidenceThreshold: body.reviewConfidenceThreshold }
            : {}),
          ...(body.tables !== undefined ? { tables: body.tables } : {}),
          ...(body.requireNonEmptyTables !== undefined
            ? { requireNonEmptyTables: body.requireNonEmptyTables }
            : {}),
        });
      } catch (error) {
        const err = warehouseErrorResponse(error);
        return c.json(err.body, err.status);
      }
      if ("code" in outcome) {
        return c.json(outcome, 422);
      }
      const row = await insertOntologyDiscoveryRun(pool, {
        id: runId,
        tenantId: ctx.tenantId,
        kind: "docs_warehouse",
        catalog: ctx.catalog,
        schemaName: DOCS_SCHEMA,
        discovery: outcome.discovery,
        proposal: outcome.proposal,
        missingTables: outcome.missingTables,
        emptyTables: outcome.emptyTables,
        createdBy: ctx.username,
      });
      return c.json(
        {
          ...runSummary(row),
          profileTableCount: outcome.profileTableCount,
          discovery: outcome.discovery,
          proposal: outcome.proposal,
        },
        201,
      );
  });

  discovery.post("/docs/propose-ai", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const raw: unknown = await c.req.json().catch(() => ({}));
    const parsedBody = DiscoverDocsProposalBodySchema.safeParse(raw);
    if (!parsedBody.success) {
      return c.json({ error: "invalid_body", issues: parsedBody.error.flatten() }, 400);
    }
    const body = parsedBody.data;
    const runId = createRunId();
    let provider;
    try {
      provider = databricksProvider(config, ctx.catalog);
    } catch (error) {
      const err = warehouseErrorResponse(error);
      return c.json(err.body, err.status);
    }
    let outcome;
    try {
      outcome = await proposeDocsAiWarehouseDiscovery(provider, process.env, {
        tenantId: ctx.tenantId,
        catalog: ctx.catalog,
        runId,
        ...(body.reviewConfidenceThreshold !== undefined
          ? { reviewConfidenceThreshold: body.reviewConfidenceThreshold }
          : {}),
        ...(body.tables !== undefined ? { tables: body.tables } : {}),
        ...(body.requireNonEmptyTables !== undefined
          ? { requireNonEmptyTables: body.requireNonEmptyTables }
          : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      });
    } catch (error) {
      const err = warehouseErrorResponse(error);
      return c.json(err.body, err.status);
    }
    if ("code" in outcome) {
      if (outcome.code === "ai_not_configured") {
        return c.json(
          {
            error: "ai_not_configured",
            message: "Set AI_GATEWAY_API_KEY on control-plane to enable AI ontology extraction.",
          },
          503,
        );
      }
      return c.json(outcome, 422);
    }
    const row = await insertOntologyDiscoveryRun(pool, {
      id: runId,
      tenantId: ctx.tenantId,
      kind: "docs_warehouse_ai",
      catalog: ctx.catalog,
      schemaName: DOCS_SCHEMA,
      discovery: outcome.discovery,
      proposal: outcome.proposal,
      missingTables: outcome.missingTables,
      emptyTables: outcome.emptyTables,
      createdBy: ctx.username,
    });
    return c.json(
      {
        ...runSummary(row),
        profileTableCount: outcome.profileTableCount,
        sampleTableCount: outcome.sampleTableCount,
        aiUsage: outcome.aiUsage,
        discovery: outcome.discovery,
        proposal: outcome.proposal,
      },
      201,
    );
  });

  discovery.get("/runs", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const rows = await listOntologyDiscoveryRuns(pool, ctx.tenantId, LIST_RUNS_LIMIT);
    return c.json({ runs: rows.map(runSummary) });
  });

  discovery.get("/runs/:runId", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const runId = c.req.param("runId") ?? "";
    const row = await getOntologyDiscoveryRun(pool, ctx.tenantId, runId);
    if (row === undefined) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({
      ...runSummary(row),
      discovery: row.discovery,
      proposal: row.proposal,
    });
  });

  discovery.post(
    "/runs/:runId/review",
    requireAuthoringRole("editor"),
    zValidator("json", ApplyDiscoveryReviewBodySchema),
    async (c) => {
      const ctx = getAuthoring(c);
      const runId = c.req.param("runId") ?? "";
      const body = c.req.valid("json");
      const row = await getOntologyDiscoveryRun(pool, ctx.tenantId, runId);
      if (row === undefined) {
        return c.json({ error: "not_found" }, 404);
      }
      if (body.runId !== runId || body.runId !== row.proposal.runId) {
        return c.json({ error: "run_id_mismatch" }, 400);
      }
      if (row.applied_at !== null && body.allowReapply !== true) {
        return c.json(
          {
            error: "already_applied",
            appliedAt: row.applied_at.toISOString(),
            appliedRevision: row.applied_revision,
          },
          409,
        );
      }
      const review = {
        runId: body.runId,
        answeredAt: body.answeredAt,
        answers: body.answers,
        ...(body.reviewer !== undefined ? { reviewer: body.reviewer } : {}),
      };
      const draft = await ensureOntologyDraft(pool, ctx.tenantId, ctx.username);
      const built = buildDiscoveryReviewCommands(draft.model, row.proposal, review, {
        ...(body.reviewConfidenceThreshold !== undefined
          ? { reviewConfidenceThreshold: body.reviewConfidenceThreshold }
          : {}),
        ...(body.includeRelations !== undefined ? { includeRelations: body.includeRelations } : {}),
        requireCompleteReview: body.requireCompleteReview ?? body.apply === true,
      });
      if ("code" in built) {
        return c.json(built, 422);
      }
      const { commands, staleAnswerCount, unansweredQuestionIds } = built;
      if (body.apply !== true) {
        return c.json({
          runId,
          staleAnswerCount,
          unansweredQuestionIds,
          commands,
          applied: false,
        });
      }
      if (commands.length === 0) {
        return c.json({
          runId,
          staleAnswerCount,
          unansweredQuestionIds,
          commands,
          applied: false,
          reason: "no_commands",
        });
      }
      const ifMatch = c.req.header("If-Match")?.replace(/^"|"$/g, "");
      if (ifMatch === undefined || ifMatch.length === 0) {
        return c.json({ error: "if_match_required", revision: draft.revision }, 428);
      }
      const expectedRevision = Number.parseInt(ifMatch, 10);
      if (!Number.isFinite(expectedRevision)) {
        return c.json({ error: "if_match_invalid" }, 400);
      }
      if (draft.revision !== expectedRevision) {
        return c.json({ error: "revision_conflict", revision: draft.revision }, 409);
      }
      let nextModel = draft.model;
      try {
        nextModel = applyAuthoringCommandBatches(draft.model, commands);
      } catch (error) {
        const message = error instanceof AuthoringCommandError ? error.message : String(error);
        return c.json({ error: message }, 400);
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
      await markOntologyDiscoveryRunApplied(pool, ctx.tenantId, runId, applied.revision);
      const validation = validateDraftModel(applied.model, ctx.tenantId);
      return c.json({
        runId,
        staleAnswerCount,
        unansweredQuestionIds,
        commands,
        applied: true,
        revision: applied.revision,
        validation: {
          valid: validation.valid,
          issues: validation.issues,
        },
      });
    },
  );

  app.route(base, discovery);
}
