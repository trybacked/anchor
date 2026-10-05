import {
  AuthoringCommandSchema,
  SemanticModelSchema,
  type AuthoringCommand,
  type SemanticModel,
  type TenantRole,
} from "@trybacked/core";
import { randomUUID } from "node:crypto";
import type pg from "pg";
export type OntologyDraftRow = {
  tenant_id: string;
  revision: number;
  model: SemanticModel;
  based_on_version: number | null;
  updated_by: string | null;
  updated_at: Date;
};
export type OntologyVersionRow = {
  tenant_id: string;
  version: number;
  model: SemanticModel;
  ontology: Record<string, unknown>;
  published_by: string | null;
  published_at: Date;
  notes: string | null;
  artifact_path: string | null;
};
export type RoleBindingRow = {
  tenant_id: string;
  subject_type: "user" | "workos_role";
  subject: string;
  role: TenantRole;
};
export type DerivedDatasetRow = {
  tenant_id: string;
  name: string;
  schema_name: string;
  sql: string;
  status: "pending" | "active" | "failed";
  last_error: string | null;
  created_by: string | null;
};
function parseModel(value: unknown): SemanticModel {
  return SemanticModelSchema.parse(value);
}
export async function getOntologyDraft(
  pool: pg.Pool,
  tenantId: string,
): Promise<OntologyDraftRow | undefined> {
  const result = await pool.query<{
    tenant_id: string;
    revision: number;
    model: unknown;
    based_on_version: number | null;
    updated_by: string | null;
    updated_at: Date;
  }>("SELECT * FROM ontology_drafts WHERE tenant_id = $1", [tenantId]);
  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }
  return {
    ...row,
    model: parseModel(row.model),
  };
}
export async function upsertOntologyDraft(
  pool: pg.Pool,
  input: {
    tenantId: string;
    revision: number;
    model: SemanticModel;
    basedOnVersion: number | null;
    updatedBy: string;
  },
): Promise<OntologyDraftRow> {
  const result = await pool.query<{
    tenant_id: string;
    revision: number;
    model: unknown;
    based_on_version: number | null;
    updated_by: string | null;
    updated_at: Date;
  }>(
    `INSERT INTO ontology_drafts (tenant_id, revision, model, based_on_version, updated_by)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (tenant_id) DO UPDATE SET
       revision = EXCLUDED.revision,
       model = EXCLUDED.model,
       based_on_version = EXCLUDED.based_on_version,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING *`,
    [
      input.tenantId,
      input.revision,
      JSON.stringify(input.model),
      input.basedOnVersion,
      input.updatedBy,
    ],
  );
  const row = result.rows[0] as NonNullable<(typeof result.rows)[0]>;
  return { ...row, model: parseModel(row.model) };
}
export async function applyDraftCommandsTx(
  pool: pg.Pool,
  input: {
    tenantId: string;
    expectedRevision: number;
    nextModel: SemanticModel;
    commands: AuthoringCommand[];
    actor: string;
  },
): Promise<
  | {
      revision: number;
      model: SemanticModel;
    }
  | "revision_conflict"
> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{
      revision: number;
    }>("SELECT revision FROM ontology_drafts WHERE tenant_id = $1 FOR UPDATE", [input.tenantId]);
    const revision = current.rows[0]?.revision;
    if (revision === undefined || revision !== input.expectedRevision) {
      await client.query("ROLLBACK");
      return "revision_conflict";
    }
    const nextRevision = revision + 1;
    await client.query(
      `UPDATE ontology_drafts
       SET revision = $2, model = $3::jsonb, updated_by = $4, updated_at = now()
       WHERE tenant_id = $1`,
      [input.tenantId, nextRevision, JSON.stringify(input.nextModel), input.actor],
    );
    for (const command of input.commands) {
      AuthoringCommandSchema.parse(command);
      await client.query(
        `INSERT INTO ontology_changes (id, tenant_id, revision, command, actor)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [randomUUID(), input.tenantId, nextRevision, JSON.stringify(command), input.actor],
      );
    }
    await client.query("COMMIT");
    return { revision: nextRevision, model: input.nextModel };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function listOntologyVersions(
  pool: pg.Pool,
  tenantId: string,
): Promise<Omit<OntologyVersionRow, "model" | "ontology">[]> {
  const result = await pool.query<{
    tenant_id: string;
    version: number;
    published_by: string | null;
    published_at: Date;
    notes: string | null;
    artifact_path: string | null;
  }>(
    `SELECT tenant_id, version, published_by, published_at, notes, artifact_path
     FROM ontology_versions WHERE tenant_id = $1 ORDER BY version DESC`,
    [tenantId],
  );
  return result.rows;
}
export async function getOntologyVersion(
  pool: pg.Pool,
  tenantId: string,
  version: number,
): Promise<OntologyVersionRow | undefined> {
  const result = await pool.query<{
    tenant_id: string;
    version: number;
    model: unknown;
    ontology: unknown;
    published_by: string | null;
    published_at: Date;
    notes: string | null;
    artifact_path: string | null;
  }>("SELECT * FROM ontology_versions WHERE tenant_id = $1 AND version = $2", [tenantId, version]);
  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }
  return {
    ...row,
    model: parseModel(row.model),
    ontology: row.ontology as Record<string, unknown>,
  };
}
export async function insertOntologyVersion(
  pool: pg.Pool,
  row: Omit<OntologyVersionRow, "published_at"> & {
    publishedAt?: Date;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO ontology_versions
     (tenant_id, version, model, ontology, published_by, notes, artifact_path)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)`,
    [
      row.tenant_id,
      row.version,
      JSON.stringify(row.model),
      JSON.stringify(row.ontology),
      row.published_by,
      row.notes,
      row.artifact_path,
    ],
  );
  await pool.query(
    `UPDATE organizations SET ontology_version = $2, updated_at = now() WHERE tenant_id = $1`,
    [row.tenant_id, row.version],
  );
}
export async function getLatestOntologyVersion(pool: pg.Pool, tenantId: string): Promise<number> {
  const result = await pool.query<{
    version: number | null;
  }>("SELECT MAX(version) AS version FROM ontology_versions WHERE tenant_id = $1", [tenantId]);
  return result.rows[0]?.version ?? 0;
}
export async function listOntologyChanges(
  pool: pg.Pool,
  tenantId: string,
  limit: number,
): Promise<
  {
    revision: number;
    command: AuthoringCommand;
    actor: string;
    createdAt: string;
  }[]
> {
  const result = await pool.query<{
    revision: number;
    command: unknown;
    actor: string;
    created_at: Date;
  }>(
    `SELECT revision, command, actor, created_at FROM ontology_changes
     WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => ({
    revision: row.revision,
    command: AuthoringCommandSchema.parse(row.command),
    actor: row.actor,
    createdAt: row.created_at.toISOString(),
  }));
}
export async function listRoleBindings(pool: pg.Pool, tenantId: string): Promise<RoleBindingRow[]> {
  const result = await pool.query<RoleBindingRow>(
    "SELECT tenant_id, subject_type, subject, role FROM tenant_role_bindings WHERE tenant_id = $1",
    [tenantId],
  );
  return result.rows;
}
export async function upsertRoleBinding(pool: pg.Pool, binding: RoleBindingRow): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_role_bindings (tenant_id, subject_type, subject, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, subject_type, subject) DO UPDATE SET role = EXCLUDED.role`,
    [binding.tenant_id, binding.subject_type, binding.subject, binding.role],
  );
}
export async function deleteRoleBinding(
  pool: pg.Pool,
  tenantId: string,
  subjectType: string,
  subject: string,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM tenant_role_bindings
     WHERE tenant_id = $1 AND subject_type = $2 AND subject = $3`,
    [tenantId, subjectType, subject],
  );
  return (result.rowCount ?? 0) > 0;
}
export async function resolveTenantRole(
  pool: pg.Pool,
  tenantId: string,
  username: string,
  workosRoleSlugs: string[],
): Promise<TenantRole> {
  const bindings = await listRoleBindings(pool, tenantId);
  const userBinding = bindings.find(
    (binding) => binding.subject_type === "user" && binding.subject === username,
  );
  if (userBinding !== undefined) {
    return userBinding.role;
  }
  for (const slug of workosRoleSlugs) {
    const roleBinding = bindings.find(
      (binding) => binding.subject_type === "workos_role" && binding.subject === slug,
    );
    if (roleBinding !== undefined) {
      return roleBinding.role;
    }
  }
  return "viewer";
}
export async function listDerivedDatasets(
  pool: pg.Pool,
  tenantId: string,
): Promise<DerivedDatasetRow[]> {
  const result = await pool.query<DerivedDatasetRow>(
    "SELECT tenant_id, name, schema_name, sql, status, last_error, created_by FROM derived_datasets WHERE tenant_id = $1",
    [tenantId],
  );
  return result.rows;
}
export async function insertDerivedDataset(pool: pg.Pool, row: DerivedDatasetRow): Promise<void> {
  await pool.query(
    `INSERT INTO derived_datasets (tenant_id, name, schema_name, sql, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.tenant_id, row.name, row.schema_name, row.sql, row.status, row.created_by],
  );
}
