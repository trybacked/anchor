import type pg from "pg";
export async function insertSemanticRun(
  pool: pg.Pool,
  input: {
    tenantId: string;
    runId: string;
    actor: string;
    outcome: string;
    model?: string | undefined;
    steps: Record<string, unknown>[];
    usage?: Record<string, unknown> | undefined;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO semantic_runs (run_id, tenant_id, actor, outcome, model, steps, usage)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     ON CONFLICT (run_id) DO UPDATE SET
       outcome = EXCLUDED.outcome,
       model = EXCLUDED.model,
       steps = EXCLUDED.steps,
       usage = EXCLUDED.usage`,
    [
      input.runId,
      input.tenantId,
      input.actor,
      input.outcome,
      input.model ?? null,
      JSON.stringify(input.steps),
      JSON.stringify(input.usage ?? null),
    ],
  );
}
export async function insertSemanticFeedback(
  pool: pg.Pool,
  input: {
    tenantId: string;
    runId: string;
    rating: "up" | "down";
    actor: string;
    correction?: string | undefined;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO semantic_feedback (run_id, tenant_id, rating, actor, correction)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.runId, input.tenantId, input.rating, input.actor, input.correction ?? null],
  );
}
export async function listSemanticRuns(
  pool: pg.Pool,
  tenantId: string,
  limit: number,
): Promise<
  {
    runId: string;
    outcome: string;
    model: string | null;
    createdAt: string;
  }[]
> {
  const result = await pool.query<{
    run_id: string;
    outcome: string;
    model: string | null;
    created_at: Date;
  }>(
    `SELECT run_id, outcome, model, created_at
     FROM semantic_runs
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => ({
    runId: row.run_id,
    outcome: row.outcome,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  }));
}
