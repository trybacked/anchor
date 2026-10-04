CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  catalog TEXT NOT NULL,
  mcp_name TEXT NOT NULL,
  shared_spaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  workos_organization_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  service_principal_app_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);
CREATE INDEX IF NOT EXISTS organizations_workos_org_idx ON organizations (workos_organization_id);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provisioning_jobs_status_idx ON provisioning_jobs (status);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
  cors_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_secret_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_clients_updated_idx ON oauth_clients (updated_at);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ontology_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ontology_drafts (
  tenant_id TEXT PRIMARY KEY REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  revision INT NOT NULL DEFAULT 0,
  model JSONB NOT NULL,
  based_on_version INT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontology_versions (
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  version INT NOT NULL,
  model JSONB NOT NULL,
  ontology JSONB NOT NULL,
  published_by TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  artifact_path TEXT,
  PRIMARY KEY (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS ontology_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  revision INT NOT NULL,
  command JSONB NOT NULL,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ontology_changes_tenant_idx ON ontology_changes (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_role_bindings (
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (tenant_id, subject_type, subject)
);

CREATE TABLE IF NOT EXISTS semantic_runs (
  run_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL,
  model TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_runs_tenant_idx ON semantic_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS semantic_feedback (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES semantic_runs (run_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  actor TEXT NOT NULL,
  correction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_feedback_run_idx ON semantic_feedback (run_id);

CREATE TABLE IF NOT EXISTS derived_datasets (
  tenant_id TEXT NOT NULL REFERENCES organizations (tenant_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schema_name TEXT NOT NULL DEFAULT 'curated',
  sql TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, name)
);
