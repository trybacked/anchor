import {
  DiscoveryReportSchema,
  ProposalSchema,
  type DiscoveryReport,
  type Proposal,
} from "@trybacked/core";
import type pg from "pg";

export type OntologyDiscoveryRunRow = {
  id: string;
  tenant_id: string;
  kind: string;
  catalog: string;
  schema_name: string;
  discovery: DiscoveryReport;
  proposal: Proposal;
  missing_tables: string[];
  empty_tables: string[];
  created_by: string;
  created_at: Date;
  applied_at: Date | null;
  applied_revision: number | null;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseDiscovery(value: unknown): DiscoveryReport {
  return DiscoveryReportSchema.parse(value);
}

function parseProposal(value: unknown): Proposal {
  return ProposalSchema.parse(value);
}

function mapRow(row: {
  id: string;
  tenant_id: string;
  kind: string;
  catalog: string;
  schema_name: string;
  discovery: unknown;
  proposal: unknown;
  missing_tables: unknown;
  empty_tables?: unknown;
  created_by: string;
  created_at: Date;
  applied_at: Date | null;
  applied_revision: number | null;
}): OntologyDiscoveryRunRow {
  return {
    ...row,
    discovery: parseDiscovery(row.discovery),
    proposal: parseProposal(row.proposal),
    missing_tables: parseStringArray(row.missing_tables),
    empty_tables: parseStringArray(row.empty_tables),
  };
}

export async function insertOntologyDiscoveryRun(
  pool: pg.Pool,
  input: {
    id: string;
    tenantId: string;
    kind: string;
    catalog: string;
    schemaName: string;
    discovery: DiscoveryReport;
    proposal: Proposal;
    missingTables: string[];
    emptyTables: string[];
    createdBy: string;
  },
): Promise<OntologyDiscoveryRunRow> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    kind: string;
    catalog: string;
    schema_name: string;
    discovery: unknown;
    proposal: unknown;
    missing_tables: unknown;
    empty_tables: unknown;
    created_by: string;
    created_at: Date;
    applied_at: Date | null;
    applied_revision: number | null;
  }>(
    `INSERT INTO ontology_discovery_runs
      (id, tenant_id, kind, catalog, schema_name, discovery, proposal, missing_tables, empty_tables, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
     RETURNING *`,
    [
      input.id,
      input.tenantId,
      input.kind,
      input.catalog,
      input.schemaName,
      JSON.stringify(input.discovery),
      JSON.stringify(input.proposal),
      JSON.stringify(input.missingTables),
      JSON.stringify(input.emptyTables),
      input.createdBy,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Failed to insert ontology discovery run");
  }
  return mapRow(row);
}

export async function getOntologyDiscoveryRun(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
): Promise<OntologyDiscoveryRunRow | undefined> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    kind: string;
    catalog: string;
    schema_name: string;
    discovery: unknown;
    proposal: unknown;
    missing_tables: unknown;
    empty_tables: unknown;
    created_by: string;
    created_at: Date;
    applied_at: Date | null;
    applied_revision: number | null;
  }>("SELECT * FROM ontology_discovery_runs WHERE tenant_id = $1 AND id = $2", [tenantId, runId]);
  const row = result.rows[0];
  if (row === undefined) {
    return undefined;
  }
  return mapRow(row);
}

export async function listOntologyDiscoveryRuns(
  pool: pg.Pool,
  tenantId: string,
  limit: number,
): Promise<OntologyDiscoveryRunRow[]> {
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    kind: string;
    catalog: string;
    schema_name: string;
    discovery: unknown;
    proposal: unknown;
    missing_tables: unknown;
    empty_tables: unknown;
    created_by: string;
    created_at: Date;
    applied_at: Date | null;
    applied_revision: number | null;
  }>(
    `SELECT * FROM ontology_discovery_runs
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return result.rows.map((row) => mapRow(row));
}

export async function markOntologyDiscoveryRunApplied(
  pool: pg.Pool,
  tenantId: string,
  runId: string,
  revision: number,
): Promise<void> {
  await pool.query(
    `UPDATE ontology_discovery_runs
     SET applied_at = now(), applied_revision = $3
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId, revision],
  );
}
