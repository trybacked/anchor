import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
export async function applyControlPlaneSchema(pool: pg.Pool): Promise<void> {
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "db", "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  console.error("Control plane schema applied.");
}
