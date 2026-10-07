import type { Pool } from "pg";
import { z } from "zod";

/**
 * TenantProfile repositories (Plan Phase 2).
 *
 * Configuration is data, not code: locale, AI policy, engine connections and
 * ingested sources (with capabilities and bindings) live in the control plane.
 * Nothing here references a specific warehouse vendor or domain schema.
 */
export const AiPolicyModeSchema = z.enum(["propose_review", "full_auto", "assist_only"]);
export const TenantSettingsSchema = z.object({
  locale: z.string().min(2).max(8),
  aiPolicy: AiPolicyModeSchema,
  aiModel: z.string().min(1).nullable(),
});
export const TenantConnectionSchema = z.object({
  connectionId: z.string().min(1),
  engine: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  secretRef: z.string().min(1).nullable(),
});
export const TenantSourceSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum(["table", "document_archive", "api", "stream"]),
  connectionId: z.string().min(1),
  namespace: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  binding: z.record(z.string(), z.unknown()),
});
export const TenantProfileSchema = z.object({
  tenantId: z.string().min(1),
  settings: TenantSettingsSchema,
  connections: z.array(TenantConnectionSchema),
  sources: z.array(TenantSourceSchema),
});
export type TenantSettings = z.infer<typeof TenantSettingsSchema>;
export type TenantConnection = z.infer<typeof TenantConnectionSchema>;
export type TenantSource = z.infer<typeof TenantSourceSchema>;
export type TenantProfile = z.infer<typeof TenantProfileSchema>;

const DEFAULT_SETTINGS: TenantSettings = { locale: "en", aiPolicy: "propose_review", aiModel: null };

function mapSettings(row: Record<string, unknown> | null): TenantSettings {
  if (row === null) {
    return DEFAULT_SETTINGS;
  }
  return {
    locale: typeof row.locale === "string" ? row.locale : DEFAULT_SETTINGS.locale,
    aiPolicy: AiPolicyModeSchema.parse(row.ai_policy ?? DEFAULT_SETTINGS.aiPolicy),
    aiModel: typeof row.ai_model === "string" ? row.ai_model : null,
  };
}

export async function getTenantSettings(
  pool: Pool,
  tenantId: string,
): Promise<TenantSettings> {
  const result = await pool.query(
    "SELECT locale, ai_policy, ai_model FROM tenant_settings WHERE tenant_id = $1",
    [tenantId],
  );
  return mapSettings(result.rows[0] ?? null);
}

export async function putTenantSettings(
  pool: Pool,
  tenantId: string,
  settings: TenantSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_settings (tenant_id, locale, ai_policy, ai_model, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (tenant_id) DO UPDATE
       SET locale = EXCLUDED.locale, ai_policy = EXCLUDED.ai_policy,
           ai_model = EXCLUDED.ai_model, updated_at = now()`,
    [tenantId, settings.locale, settings.aiPolicy, settings.aiModel],
  );
}

export async function listTenantConnections(
  pool: Pool,
  tenantId: string,
): Promise<TenantConnection[]> {
  const result = await pool.query(
    `SELECT connection_id, engine, config, secret_ref
     FROM tenant_connections WHERE tenant_id = $1 ORDER BY connection_id`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    connectionId: String(row.connection_id),
    engine: String(row.engine),
    config: (row.config ?? {}) as Record<string, unknown>,
    secretRef: typeof row.secret_ref === "string" ? row.secret_ref : null,
  }));
}

export async function upsertTenantConnection(
  pool: Pool,
  tenantId: string,
  connection: TenantConnection,
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_connections (tenant_id, connection_id, engine, config, secret_ref)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, connection_id) DO UPDATE
       SET engine = EXCLUDED.engine, config = EXCLUDED.config, secret_ref = EXCLUDED.secret_ref`,
    [tenantId, connection.connectionId, connection.engine, JSON.stringify(connection.config), connection.secretRef],
  );
}

export async function listTenantSources(pool: Pool, tenantId: string): Promise<TenantSource[]> {
  const result = await pool.query(
    `SELECT source_id, kind, connection_id, namespace, capabilities, binding
     FROM tenant_sources WHERE tenant_id = $1 ORDER BY source_id`,
    [tenantId],
  );
  return result.rows.map((row) => ({
    sourceId: String(row.source_id),
    kind: TenantSourceSchema.shape.kind.parse(row.kind),
    connectionId: String(row.connection_id),
    namespace: String(row.namespace),
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String) : [],
    binding: (row.binding ?? {}) as Record<string, unknown>,
  }));
}

export async function upsertTenantSource(
  pool: Pool,
  tenantId: string,
  source: TenantSource,
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_sources (tenant_id, source_id, kind, connection_id, namespace, capabilities, binding)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, source_id) DO UPDATE
       SET kind = EXCLUDED.kind, connection_id = EXCLUDED.connection_id,
           namespace = EXCLUDED.namespace, capabilities = EXCLUDED.capabilities,
           binding = EXCLUDED.binding`,
    [
      tenantId,
      source.sourceId,
      source.kind,
      source.connectionId,
      source.namespace,
      JSON.stringify(source.capabilities),
      JSON.stringify(source.binding),
    ],
  );
}

export async function getTenantProfile(pool: Pool, tenantId: string): Promise<TenantProfile> {
  const [settings, connections, sources] = await Promise.all([
    getTenantSettings(pool, tenantId),
    listTenantConnections(pool, tenantId),
    listTenantSources(pool, tenantId),
  ]);
  return { tenantId, settings, connections, sources };
}