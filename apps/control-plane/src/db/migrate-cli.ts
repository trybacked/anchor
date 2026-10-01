import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readControlPlaneConfig } from "../config.js";
import { createPool } from "./pool.js";

const config = readControlPlaneConfig(process.env);
const pool = createPool(config.databaseUrl);
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
const sql = readFileSync(schemaPath, "utf8");

try {
  await pool.query(sql);
  console.error("Control plane schema applied.");
} finally {
  await pool.end();
}
