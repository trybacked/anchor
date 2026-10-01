import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import { resolvePublicOrigin } from "../../src/public-origin.js";

function minimalConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    host: "127.0.0.1",
    port: 8790,
    sessionSecret: "s".repeat(32),
    sessionTtlSeconds: 3600,
    cookieSecure: true,
    tenantsRegistryPath: "/tmp/tenants.yaml",
    usersFilePath: "/tmp/users.yaml",
    authMode: "file",
    rateLimitPerMinute: 60,
    platformUpstream: "http://127.0.0.1:8787",
    platformToken: "token",
    ...overrides,
  };
}

describe("resolvePublicOrigin", () => {
  it("uses configured publicOrigin", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ origin: resolvePublicOrigin(c, minimalConfig({ publicOrigin: "https://api.backed.app" })) }));
    const res = await app.request("http://127.0.0.1:8790/");
    expect(await res.json()).toEqual({ origin: "https://api.backed.app" });
  });

  it("upgrades http request URL to https for public hostnames", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ origin: resolvePublicOrigin(c, minimalConfig()) }));
    const res = await app.request("http://127.0.0.1:8790/", {
      headers: { host: "api.backed.app" },
    });
    expect(await res.json()).toEqual({ origin: "https://api.backed.app" });
  });

  it("respects x-forwarded-proto and x-forwarded-host", async () => {
    const app = new Hono();
    app.get("/", (c) => c.json({ origin: resolvePublicOrigin(c, minimalConfig()) }));
    const res = await app.request("http://10.0.0.1:8790/", {
      headers: {
        host: "api.backed.app",
        "x-forwarded-host": "api.backed.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(await res.json()).toEqual({ origin: "https://api.backed.app" });
  });
});
