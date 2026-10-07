import type pg from "pg";
import { z } from "zod";

/** Storage for AI ontology proposals (Plan Fase 5). */

export const AiProposalScopeKindSchema = z.enum(["source", "dataset", "tenant"]);
export const AiProposalStatusSchema = z.enum(["proposed", "approved", "rejected", "applied"]);

export type AiProposalRow = {
  id: string;
  tenantId: string;
  runId: string;
  scopeKind: z.infer<typeof AiProposalScopeKindSchema>;
  scopeRef: string | undefined;
  status: z.infer<typeof AiProposalStatusSchema>;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function rowToProposal(row: {
  id: string;
  tenant_id: string;
  run_id: string;
  scope_kind: string;
  scope_ref: string | null;
  status: string;
  payload: unknown;
  created_at: Date;
  updated_at: Date;
}): AiProposalRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: row.run_id,
    scopeKind: AiProposalScopeKindSchema.parse(row.scope_kind),
    scopeRef: row.scope_ref ?? undefined,
    status: AiProposalStatusSchema.parse(row.status),
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureAiProposalsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_proposals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_ref TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function insertAiProposal(
  pool: pg.Pool,
  input: {
    id: string;
    tenantId: string;
    runId: string;
    scopeKind: z.infer<typeof AiProposalScopeKindSchema>;
    scopeRef?: string | undefined;
    payload: unknown;
  },
): Promise<AiProposalRow> {
  const result = await pool.query(
    `INSERT INTO ai_proposals (id, tenant_id, run_id, scope_kind, scope_ref, status, payload)
     VALUES ($1, $2, $3, $4, $5, 'proposed', $6)
     RETURNING *`,
    [
      input.id,
      input.tenantId,
      input.runId,
      input.scopeKind,
      input.scopeRef ?? null,
      JSON.stringify(input.payload),
    ],
  );
  return rowToProposal(result.rows[0] as Parameters<typeof rowToProposal>[0]);
}

export async function getAiProposal(
  pool: pg.Pool,
  tenantId: string,
  proposalId: string,
): Promise<AiProposalRow | undefined> {
  const result = await pool.query(`SELECT * FROM ai_proposals WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    proposalId,
  ]);
  const row = result.rows[0] as Parameters<typeof rowToProposal>[0] | undefined;
  return row === undefined ? undefined : rowToProposal(row);
}

export async function listAiProposals(
  pool: pg.Pool,
  tenantId: string,
  limit = 30,
): Promise<AiProposalRow[]> {
  const result = await pool.query(
    `SELECT * FROM ai_proposals WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => rowToProposal(row as Parameters<typeof rowToProposal>[0]));
}

export async function setAiProposalStatus(
  pool: pg.Pool,
  tenantId: string,
  proposalId: string,
  status: z.infer<typeof AiProposalStatusSchema>,
): Promise<AiProposalRow | undefined> {
  const result = await pool.query(
    `UPDATE ai_proposals SET status = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, proposalId, status],
  );
  const row = result.rows[0] as Parameters<typeof rowToProposal>[0] | undefined;
  return row === undefined ? undefined : rowToProposal(row);
}
