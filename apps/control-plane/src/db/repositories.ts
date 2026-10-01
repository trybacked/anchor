import { resolveTenantCatalog } from "@trybacked/core";
import { randomUUID } from "node:crypto";
import type pg from "pg";

export type OrganizationRow = {
  id: string;
  tenant_id: string;
  catalog: string;
  mcp_name: string;
  shared_spaces: string[];
  workos_organization_id: string | null;
  status: string;
  service_principal_app_id: string | null;
};

export type JobRow = {
  id: string;
  organization_id: string;
  kind: string;
  status: string;
  attempts: number;
  error: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
};

export async function insertOrganization(
  pool: pg.Pool,
  input: {
    tenantId: string;
    sharedSpaces: string[];
    workosOrganizationId?: string | undefined;
  },
): Promise<OrganizationRow> {
  const id = randomUUID();
  const catalog = resolveTenantCatalog(input.tenantId);
  const mcpName = `backed-${input.tenantId}`;
  const result = await pool.query<OrganizationRow>(
    `INSERT INTO organizations (id, tenant_id, catalog, mcp_name, shared_spaces, workos_organization_id, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending')
     RETURNING *`,
    [
      id,
      input.tenantId,
      catalog,
      mcpName,
      JSON.stringify(input.sharedSpaces),
      input.workosOrganizationId ?? null,
    ],
  );
  return result.rows[0] as OrganizationRow;
}

export async function listOrganizations(pool: pg.Pool): Promise<OrganizationRow[]> {
  const result = await pool.query<OrganizationRow>(
    "SELECT * FROM organizations ORDER BY created_at DESC",
  );
  return result.rows;
}

export async function getOrganizationByTenantId(
  pool: pg.Pool,
  tenantId: string,
): Promise<OrganizationRow | undefined> {
  const result = await pool.query<OrganizationRow>(
    "SELECT * FROM organizations WHERE tenant_id = $1",
    [tenantId],
  );
  return result.rows[0];
}

export async function listActiveOrganizations(pool: pg.Pool): Promise<OrganizationRow[]> {
  const result = await pool.query<OrganizationRow>(
    "SELECT * FROM organizations WHERE status = 'active' ORDER BY tenant_id",
  );
  return result.rows;
}

export async function updateOrganizationStatus(
  pool: pg.Pool,
  id: string,
  status: string,
  fields?: { servicePrincipalAppId?: string | undefined },
): Promise<void> {
  await pool.query(
    `UPDATE organizations
     SET status = $2,
         service_principal_app_id = COALESCE($3, service_principal_app_id),
         updated_at = now()
     WHERE id = $1`,
    [id, status, fields?.servicePrincipalAppId ?? null],
  );
}

export async function enqueueJob(
  pool: pg.Pool,
  organizationId: string,
  kind: string,
  payload: Record<string, unknown> = {},
): Promise<JobRow> {
  const id = randomUUID();
  const result = await pool.query<JobRow>(
    `INSERT INTO provisioning_jobs (id, organization_id, kind, status, payload)
     VALUES ($1, $2, $3, 'pending', $4::jsonb)
     RETURNING *`,
    [id, organizationId, kind, JSON.stringify(payload)],
  );
  return result.rows[0] as JobRow;
}

export async function getJob(pool: pg.Pool, jobId: string): Promise<JobRow | undefined> {
  const result = await pool.query<JobRow>("SELECT * FROM provisioning_jobs WHERE id = $1", [jobId]);
  return result.rows[0];
}

export async function claimNextJob(pool: pg.Pool): Promise<JobRow | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query<JobRow>(
      `SELECT * FROM provisioning_jobs
       WHERE status = 'pending'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    const job = claimed.rows[0];
    if (job === undefined) {
      await client.query("COMMIT");
      return undefined;
    }
    await client.query(
      `UPDATE provisioning_jobs
       SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
       WHERE id = $1`,
      [job.id],
    );
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeJob(
  pool: pg.Pool,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE provisioning_jobs
     SET status = 'completed', result = $2::jsonb, error = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId, JSON.stringify(result)],
  );
}

export async function failJob(pool: pg.Pool, jobId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE provisioning_jobs
     SET status = 'failed', error = $2, updated_at = now()
     WHERE id = $1`,
    [jobId, error],
  );
}

export async function requeueJob(pool: pg.Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE provisioning_jobs
     SET status = 'pending', locked_at = NULL, error = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId],
  );
}

export async function listTenantsForWorkosOrganizations(
  pool: pg.Pool,
  workosOrganizationIds: string[],
): Promise<string[]> {
  if (workosOrganizationIds.length === 0) {
    return [];
  }
  const result = await pool.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM organizations
     WHERE status = 'active'
       AND workos_organization_id = ANY($1::text[])`,
    [workosOrganizationIds],
  );
  return result.rows.map((row) => row.tenant_id);
}
