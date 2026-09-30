import { serve } from "@hono/node-server";
import { createGatewayApp } from "./app.js";
import { readGatewayConfig } from "./config.js";

const config = readGatewayConfig(process.env);
const app = createGatewayApp({ config });

const server = serve(
  { fetch: app.fetch, port: config.port, hostname: config.host },
  (info) => {
    const host = info.address === "::" ? "0.0.0.0" : info.address;
    console.error(
      `Backed gateway listening on http://${host}:${String(info.port)} (mode: ${config.multiTenant ? "multi" : "single"})`,
    );
    console.error("Health: /health/live · Auth: POST /login");
  },
);

function shutdown(signal: string): void {
  console.error(`Gateway received ${signal}, shutting down`);
  server.close((error) => {
    if (error !== undefined) {
      console.error(error);
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
