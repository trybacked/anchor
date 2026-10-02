import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import { resolvePublicOrigin } from "../../src/public-origin.js";

function configWith(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
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

function originFor(config: GatewayConfig): Promise<Response> {
  const app = new Hono();

  app.get("/", (c) => c.text(resolvePublicOrigin(c, config)));
  return app.request("http://127.0.0.1:8790/");
}

describe("resolvePublicOrigin", () => {
  it("uses the configured public origin", async () => {
    const response = await originFor(configWith({ publicOrigin: "https://api.backed.app" }));
    expect(await response.text()).toBe("https://api.backed.app");
  });

  it("falls back to the request origin for local development", async () => {
    const response = await originFor(configWith({ cookieSecure: false }));
    expect(await response.text()).toBe("http://127.0.0.1:8790");
  });
});
