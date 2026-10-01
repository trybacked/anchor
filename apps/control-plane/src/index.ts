import { serve } from "@hono/node-server";
import { createControlPlaneApp } from "./app.js";
import { readControlPlaneConfig } from "./config.js";
import { createPool } from "./db/pool.js";

const config = readControlPlaneConfig(process.env);
const pool = createPool(config.databaseUrl);
const app = createControlPlaneApp(config, pool);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  const host = info.address === "::" ? "0.0.0.0" : info.address;
  console.error(`Control plane listening on http://${host}:${String(info.port)}`);
});

function shutdown(signal: string): void {
  console.error(`Control plane received ${signal}, shutting down`);
  server.close((error) => {
    void pool.end().then(() => {
      if (error !== undefined) {
        console.error(error);
        process.exit(1);
      } else {
        process.exit(0);
      }
    });
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
