import { applyControlPlaneSchema } from "../apply-schema.js";
import { readControlPlaneConfig } from "../config.js";
import { createPool } from "./pool.js";

const config = readControlPlaneConfig(process.env);
const pool = createPool(config.databaseUrl);

try {
  await applyControlPlaneSchema(pool);
} finally {
  await pool.end();
}
