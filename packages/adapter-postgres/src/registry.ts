import { RemotePublicationSchema } from "@trybacked/registry";
import type { PublicationRecordLike, RegistryLocation } from "@trybacked/ports";
import type { Pool } from "pg";

/**
 * Postgres ontology registry (Plan Phase 3b).
 *
 * The registry lives in two tables and is addressed by a RegistryLocation:
 * `backed_registry_current(container)` and `backed_registry_versions(container, version)`.
 * No filesystem or vendor-specific paths are involved.
 */
export function createPostgresOntologyRegistry(pool: Pool): {
  loadCurrent: (
    location: RegistryLocation,
  ) => Promise<(PublicationRecordLike & { modelYaml: string }) | null>;
  publish: (
    location: RegistryLocation,
    record: PublicationRecordLike,
    modelYaml: string,
  ) => Promise<void>;
} {
  return {
    loadCurrent: async (location) => {
      const result = await pool.query<{ payload: unknown }>(
        "SELECT payload FROM backed_registry_current WHERE container = $1",
        [location.container],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      return RemotePublicationSchema.parse(row.payload);
    },
    publish: async (location, record, modelYaml) => {
      const payload = RemotePublicationSchema.parse({ ...record, modelYaml });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO backed_registry_versions (container, version, payload)
           VALUES ($1, $2, $3)
           ON CONFLICT (container, version) DO NOTHING`,
          [location.container, record.version, JSON.stringify(payload)],
        );
        await client.query(
          `INSERT INTO backed_registry_current (container, payload)
           VALUES ($1, $2)
           ON CONFLICT (container) DO UPDATE SET payload = EXCLUDED.payload`,
          [location.container, JSON.stringify(payload)],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** Idempotent DDL for the registry tables (run at bootstrap or migration). */
export async function ensurePostgresRegistryTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backed_registry_current (
      container TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS backed_registry_versions (
      container TEXT NOT NULL,
      version INT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (container, version)
    );
  `);
}