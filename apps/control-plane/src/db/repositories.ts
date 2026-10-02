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

export async function updateOrganizationWorkosId(
  pool: pg.Pool,
  tenantId: string,
  workosOrganizationId: string,
): Promise<OrganizationRow | undefined> {
  const result = await pool.query<OrganizationRow>(
    `UPDATE organizations
     SET workos_organization_id = $2, updated_at = now()
     WHERE tenant_id = $1
     RETURNING *`,
    [tenantId, workosOrganizationId],
  );
  return result.rows[0];
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

export type OAuthClientRow = {
  client_id: string;
  name: string;
  redirect_uris: string[];
  cors_origins: string[];
  client_secret_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapOAuthClientRow(row: OAuthClientRow): OAuthClientRow {
  return {
    ...row,
    redirect_uris: Array.isArray(row.redirect_uris) ? row.redirect_uris : [],
    cors_origins: Array.isArray(row.cors_origins) ? row.cors_origins : [],
  };
}

export async function insertOAuthClient(
  pool: pg.Pool,
  input: {
    clientId: string;
    name: string;
    redirectUris: string[];
    corsOrigins: string[];
    clientSecretHash: string | null;
  },
): Promise<OAuthClientRow> {
  const result = await pool.query<OAuthClientRow>(
    `INSERT INTO oauth_clients (client_id, name, redirect_uris, cors_origins, client_secret_hash)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING *`,
    [
      input.clientId,
      input.name,
      JSON.stringify(input.redirectUris),
      JSON.stringify(input.corsOrigins),
      input.clientSecretHash,
    ],
  );
  return mapOAuthClientRow(result.rows[0] as OAuthClientRow);
}

export async function listOAuthClients(pool: pg.Pool): Promise<OAuthClientRow[]> {
  const result = await pool.query<OAuthClientRow>("SELECT * FROM oauth_clients ORDER BY client_id");
  return result.rows.map((row) => mapOAuthClientRow(row));
}

export async function getOAuthClientById(
  pool: pg.Pool,
  clientId: string,
): Promise<OAuthClientRow | undefined> {
  const result = await pool.query<OAuthClientRow>(
    "SELECT * FROM oauth_clients WHERE client_id = $1",
    [clientId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapOAuthClientRow(row);
}

export async function deleteOAuthClient(pool: pg.Pool, clientId: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM oauth_clients WHERE client_id = $1", [clientId]);
  return (result.rowCount ?? 0) > 0;
}

export async function patchOAuthClient(
  pool: pg.Pool,
  clientId: string,
  patch: {
    name?: string | undefined;
    redirectUris?: string[] | undefined;
    corsOrigins?: string[] | undefined;
  },
): Promise<OAuthClientRow | undefined> {
  const existing = await getOAuthClientById(pool, clientId);
  if (existing === undefined) {
    return undefined;
  }
  const name = patch.name ?? existing.name;
  const redirectUris = patch.redirectUris ?? existing.redirect_uris;
  const corsOrigins = patch.corsOrigins ?? existing.cors_origins;
  const result = await pool.query<OAuthClientRow>(
    `UPDATE oauth_clients
     SET name = $2, redirect_uris = $3::jsonb, cors_origins = $4::jsonb, updated_at = now()
     WHERE client_id = $1
     RETURNING *`,
    [clientId, name, JSON.stringify(redirectUris), JSON.stringify(corsOrigins)],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : mapOAuthClientRow(row);
}
