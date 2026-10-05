import { zValidator } from "@hono/zod-validator";
import type { AuthoringCommand } from "@trybacked/core";
import { applyCommands } from "@trybacked/ontology-authoring";
import { Hono } from "hono";
import type pg from "pg";
import { z } from "zod";
import {
  getAuthoring,
  requireAuthoringAccess,
  requireAuthoringRole,
  type AuthoringVariables,
} from "../authoring/context.js";
import type { ControlPlaneConfig } from "../config.js";
import { applyDraftCommandsTx, getOntologyDraft } from "../db/ontology-repositories.js";
import {
  insertSemanticFeedback,
  insertSemanticRun,
  listSemanticRuns,
} from "../db/semantic-repositories.js";
const FeedbackBodySchema = z.object({
  runId: z.string().uuid(),
  rating: z.enum(["up", "down"]),
  correction: z.string().optional(),
  promoteToExample: z.boolean().optional(),
});
const PromoteBodySchema = z.object({
  exampleId: z.string().min(1),
  question: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
type SemanticEnv = {
  Variables: {
    authoring: AuthoringVariables;
  };
};
export function registerSemanticRoutes(app: Hono, config: ControlPlaneConfig, pool: pg.Pool): void {
  const semantic = new Hono<SemanticEnv>();
  semantic.use("*", requireAuthoringAccess(config, pool));
  semantic.get("/runs", requireAuthoringRole("viewer"), async (c) => {
    const { tenantId } = getAuthoring(c);
    const runs = await listSemanticRuns(pool, tenantId, 30);
    return c.json({ runs });
  });
  semantic.post(
    "/feedback",
    requireAuthoringRole("viewer"),
    zValidator("json", FeedbackBodySchema),
    async (c) => {
      const { tenantId, username } = getAuthoring(c);
      const body = c.req.valid("json");
      await insertSemanticFeedback(pool, {
        tenantId,
        runId: body.runId,
        rating: body.rating,
        actor: username,
        ...(body.correction !== undefined ? { correction: body.correction } : {}),
      });
      if (
        body.promoteToExample === true &&
        body.correction !== undefined &&
        body.correction.trim().length > 0
      ) {
        const draft = await getOntologyDraft(pool, tenantId);
        if (draft !== undefined) {
          const exampleId = `feedback-${body.runId.slice(0, 8)}`;
          const command: AuthoringCommand = {
            type: "upsertExample",
            example: {
              id: exampleId,
              question: body.correction.trim(),
              tags: ["feedback"],
            },
          };
          const nextModel = applyCommands(draft.model, [command]);
          await applyDraftCommandsTx(pool, {
            tenantId,
            expectedRevision: draft.revision,
            nextModel,
            commands: [command],
            actor: username,
          });
        }
      }
      return c.json({ ok: true });
    },
  );
  semantic.post(
    "/runs",
    requireAuthoringRole("editor"),
    zValidator(
      "json",
      z.object({
        runId: z.string().uuid(),
        model: z.string().optional(),
        outcome: z.enum(["answer", "clarification", "error"]),
        steps: z.array(z.record(z.unknown())).default([]),
        usage: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const { tenantId, username } = getAuthoring(c);
      const body = c.req.valid("json");
      await insertSemanticRun(pool, {
        tenantId,
        runId: body.runId,
        actor: username,
        outcome: body.outcome,
        model: body.model,
        steps: body.steps,
        usage: body.usage,
      });
      return c.json({ ok: true });
    },
  );
  semantic.post(
    "/promote-example",
    requireAuthoringRole("editor"),
    zValidator("json", PromoteBodySchema),
    async (c) => {
      const { tenantId, username } = getAuthoring(c);
      const body = c.req.valid("json");
      const draft = await getOntologyDraft(pool, tenantId);
      if (draft === undefined) {
        return c.json({ error: "No ontology draft" }, 404);
      }
      const command: AuthoringCommand = {
        type: "upsertExample",
        example: {
          id: body.exampleId,
          question: body.question,
          tags: body.tags,
        },
      };
      const nextModel = applyCommands(draft.model, [command]);
      const applied = await applyDraftCommandsTx(pool, {
        tenantId,
        expectedRevision: draft.revision,
        nextModel,
        commands: [command],
        actor: username,
      });
      if (applied === "revision_conflict") {
        return c.json({ error: "revision_conflict" }, 409);
      }
      return c.json({ ok: true, exampleId: body.exampleId });
    },
  );
  app.route("/v1/tenants/:tenantId/authoring/semantic", semantic);
}
