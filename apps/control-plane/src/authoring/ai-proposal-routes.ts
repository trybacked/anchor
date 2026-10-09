import { createRunId } from "@trybacked/core";
import { createDatasetProviderFromEnv } from "@trybacked/infrastructure";
import {
  createAiSdkLlm,
  ProposalScopeSchema,
  ReviewPolicySchema,
  runOntologyProposal,
} from "@trybacked/ontology-ai";
import {
  createGatewayLanguageModel,
  createOntologyExtractModelFromEnv,
} from "@trybacked/ontology-extract";
import { Hono } from "hono";
import type pg from "pg";
import { z } from "zod";
import type { ControlPlaneConfig } from "../config.js";
import {
  ensureAiProposalsTable,
  getAiProposal,
  insertAiProposal,
  listAiProposals,
  setAiProposalStatus,
} from "../db/ai-proposal-repositories.js";
import {
  getAuthoring,
  requireAuthoringAccess,
  requireAuthoringRole,
  type AuthoringVariables,
} from "./context.js";

const CreateProposalBodySchema = z.object({
  scope: ProposalScopeSchema,
  datasetIds: z.array(z.string().min(1)).optional(),
  locale: z.string().min(1).optional(),
  policy: ReviewPolicySchema.optional(),
});

const ReviewProposalBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewer: z.string().min(1).optional(),
});

type AuthoringEnv = {
  Variables: {
    authoring: AuthoringVariables;
  };
};

function filesProvider(config: ControlPlaneConfig, tenantId: string) {
  return createDatasetProviderFromEnv(
    {
      ...process.env,
      BACKED_FILES_ROOT: config.filesRoot,
    },
    { tenantId },
  );
}

function summary(row: Awaited<ReturnType<typeof getAiProposal>>) {
  if (row === undefined) {
    return undefined;
  }
  return {
    proposalId: row.id,
    tenantId: row.tenantId,
    runId: row.runId,
    scope: {
      kind: row.scopeKind,
      ...(row.scopeRef !== undefined ? { ref: row.scopeRef } : {}),
    },
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export function registerAiProposalRoutes(
  app: Hono,
  config: ControlPlaneConfig,
  pool: pg.Pool,
): void {
  const base = "/v1/tenants/:tenantId/authoring/ai";
  const ai = new Hono<AuthoringEnv>();
  ai.use("*", requireAuthoringAccess(config, pool));

  ai.post("/proposals", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const modelConfig = createOntologyExtractModelFromEnv(process.env);
    if (modelConfig === undefined) {
      return c.json(
        {
          error: "ai_not_configured",
          message: "Set AI_GATEWAY_API_KEY on control-plane to enable AI ontology proposals.",
        },
        503,
      );
    }
    const parsed = CreateProposalBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;
    await ensureAiProposalsTable(pool);
    let provider;
    try {
      provider = filesProvider(config, ctx.tenantId);
    } catch (error) {
      return c.json({ error: "source_unavailable", message: String(error) }, 502);
    }
    const proposalId = createRunId();
    const runId = createRunId();
    try {
      const { proposal, invalidChanges } = await runOntologyProposal({
        provider,
        llm: createAiSdkLlm(createGatewayLanguageModel(modelConfig.apiKey, modelConfig.modelId)),
        tenantId: ctx.tenantId,
        runId,
        proposalId,
        scope: body.scope,
        ...(body.datasetIds !== undefined ? { datasetIds: body.datasetIds } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.policy !== undefined ? { policy: body.policy } : {}),
      });
      const row = await insertAiProposal(pool, {
        id: proposalId,
        tenantId: ctx.tenantId,
        runId,
        scopeKind: body.scope.kind,
        scopeRef:
          body.scope.kind === "source"
            ? body.scope.sourceId
            : body.scope.kind === "dataset"
              ? body.scope.datasetId
              : undefined,
        payload: { ...proposal, ...(invalidChanges.length > 0 ? { invalidChanges } : {}) },
      });
      return c.json({ ...summary(row), proposal }, 201);
    } catch (error) {
      return c.json({ error: "proposal_failed", message: String(error) }, 502);
    }
  });

  ai.get("/proposals", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    await ensureAiProposalsTable(pool);
    const rows = await listAiProposals(pool, ctx.tenantId);
    return c.json({ proposals: rows.map((row) => summary(row)) });
  });

  ai.get("/proposals/:proposalId", requireAuthoringRole("viewer"), async (c) => {
    const ctx = getAuthoring(c);
    const proposalId = c.req.param("proposalId") ?? "";
    await ensureAiProposalsTable(pool);
    const row = await getAiProposal(pool, ctx.tenantId, proposalId);
    if (row === undefined) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ ...summary(row), payload: row.payload });
  });

  ai.post("/proposals/:proposalId/review", requireAuthoringRole("editor"), async (c) => {
    const ctx = getAuthoring(c);
    const proposalId = c.req.param("proposalId") ?? "";
    const parsed = ReviewProposalBodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.flatten() }, 400);
    }
    await ensureAiProposalsTable(pool);
    const existing = await getAiProposal(pool, ctx.tenantId, proposalId);
    if (existing === undefined) {
      return c.json({ error: "not_found" }, 404);
    }
    if (existing.status !== "proposed") {
      return c.json({ error: "already_reviewed", status: existing.status }, 409);
    }
    const row = await setAiProposalStatus(
      pool,
      ctx.tenantId,
      proposalId,
      parsed.data.decision === "approve" ? "approved" : "rejected",
    );
    return c.json({ ...summary(row) });
  });

  app.route(base, ai);
}
