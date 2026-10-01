import { serve } from "@hono/node-server";
import { Hono } from "hono";

/** Minimal HTTP liveness for Railway (provisioner has no public API). */
export function startWorkerHealthServer(): void {
  const port = Number(process.env.PORT ?? process.env.CONTROL_PLANE_PORT ?? 8791);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = new Hono();
  app.get("/health/live", (c) => c.json({ ok: true as const }));
  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const bindHost = info.address === "::" ? "0.0.0.0" : info.address;
    console.error(`Provisioner health http://${bindHost}:${String(info.port)}/health/live`);
  });
}

startWorkerHealthServer();
