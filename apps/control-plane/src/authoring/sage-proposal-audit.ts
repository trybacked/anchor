import type { AuditEvent } from "@trybacked/core";
import type { ChangeDecision } from "@trybacked/ontology-ai";
import { CATALOG_VERSION } from "@trybacked/ontology-ai";
import type pg from "pg";

export function buildSageAutoApproveAuditEvents(input: {
  runId: string;
  recordedAt: string;
  decisions: readonly ChangeDecision[];
  modelId: string;
}): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const decision of input.decisions) {
    if (decision.verdict !== "auto_approve") {
      continue;
    }
    events.push({
      id: `${input.runId}:sage_auto:${decision.changeId}`,
      recordedAt: input.recordedAt,
      runId: input.runId,
      action: "auto_confirm",
      elementId: decision.changeId,
      source: "system",
      detail: {
        catalogVersion: CATALOG_VERSION,
        modelId: input.modelId,
        reasons: decision.reasons,
        advisor: decision.advisor,
      },
    });
  }
  return events;
}

export async function recordOntologyAuditEvents(
  pool: pg.Pool,
  input: { tenantId: string; revision: number; events: readonly AuditEvent[]; actor: string },
): Promise<void> {
  for (const event of input.events) {
    await pool.query(
      `INSERT INTO ontology_changes (id, tenant_id, revision, command, actor)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, input.tenantId, input.revision, JSON.stringify(event), input.actor],
    );
  }
}
