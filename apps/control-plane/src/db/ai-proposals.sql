

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
CREATE INDEX IF NOT EXISTS ai_proposals_tenant_idx ON ai_proposals (tenant_id, created_at DESC);