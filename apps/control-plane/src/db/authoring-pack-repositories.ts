import type pg from "pg";

export type AuthoringPackRow = {
  id: string;
  name: string;
  description: string;
  commands: unknown;
  createdAt: Date;
};

function rowToPack(row: {
  id: string;
  name: string;
  description: string;
  commands: unknown;
  created_at: Date;
}): AuthoringPackRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    commands: row.commands,
    createdAt: row.created_at,
  };
}

export async function ensureAuthoringPacksTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authoring_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      commands JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function listAuthoringPacks(pool: pg.Pool): Promise<AuthoringPackRow[]> {
  await ensureAuthoringPacksTable(pool);
  const result = await pool.query(`SELECT * FROM authoring_packs ORDER BY id`);
  return result.rows.map((row) => rowToPack(row as Parameters<typeof rowToPack>[0]));
}

export async function getAuthoringPack(
  pool: pg.Pool,
  packId: string,
): Promise<AuthoringPackRow | undefined> {
  await ensureAuthoringPacksTable(pool);
  const result = await pool.query(`SELECT * FROM authoring_packs WHERE id = $1`, [packId]);
  const row = result.rows[0] as Parameters<typeof rowToPack>[0] | undefined;
  return row === undefined ? undefined : rowToPack(row);
}

export async function upsertAuthoringPack(
  pool: pg.Pool,
  input: { id: string; name: string; description?: string | undefined; commands: unknown },
): Promise<AuthoringPackRow> {
  await ensureAuthoringPacksTable(pool);
  const result = await pool.query(
    `INSERT INTO authoring_packs (id, name, description, commands)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, commands = EXCLUDED.commands
     RETURNING *`,
    [input.id, input.name, input.description ?? "", JSON.stringify(input.commands)],
  );
  return rowToPack(result.rows[0] as Parameters<typeof rowToPack>[0]);
}
