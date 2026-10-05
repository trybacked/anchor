import type { TenantsRegistry } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import type { GatewayConfig } from "../../src/config.js";
import { resolveDocsLanding } from "../../src/docs-landing.js";
import { mockRegistrySource } from "../helpers/registry-source.js";
function emptyRegistry(tenants: TenantsRegistry["tenants"] = {}): TenantsRegistry {
  return {
    enrollment: {
      host: "https://example.databricks.com",
      profile: "DEFAULT",
      warehouse_id: "wh",
    },
    shared_spaces: {},
    tenants,
  };
}
function gatewayConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    host: "127.0.0.1",
    port: 8790,
    sessionSecret: "s".repeat(32),
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    tenantsRegistryPath: "/tmp/tenants.yaml",
    usersFilePath: "/tmp/users.yaml",
    authMode: "file",
    rateLimitPerMinute: 60,
    platformUpstream: "http://127.0.0.1:8787",
    platformToken: "token",
    ...overrides,
  };
}
describe("resolveDocsLanding", () => {
  it("returns platform browse when the registry is empty", async () => {
    const landing = await resolveDocsLanding(mockRegistrySource(emptyRegistry()), gatewayConfig());
    expect(landing).toEqual({ kind: "platform" });
  });
  it("returns the sole tenant when only one is published", async () => {
    const landing = await resolveDocsLanding(
      mockRegistrySource(emptyRegistry({ gerace: { catalog: "c", schema: "s" } })),
      gatewayConfig(),
    );
    expect(landing).toEqual({ kind: "tenant", tenantId: "gerace" });
  });
  it("prefers GATEWAY_DEFAULT_TENANT when set and registered", async () => {
    const landing = await resolveDocsLanding(
      mockRegistrySource(
        emptyRegistry({
          alpha: { catalog: "c", schema: "s" },
          gerace: { catalog: "c", schema: "s" },
        }),
      ),
      gatewayConfig({ defaultTenant: "gerace" }),
    );
    expect(landing).toEqual({ kind: "tenant", tenantId: "gerace" });
  });
  it("returns a picker when several tenants exist and no default matches", async () => {
    const landing = await resolveDocsLanding(
      mockRegistrySource(
        emptyRegistry({
          alpha: { catalog: "c", schema: "s" },
          beta: { catalog: "c", schema: "s" },
        }),
      ),
      gatewayConfig(),
    );
    expect(landing).toEqual({ kind: "picker", tenants: ["alpha", "beta"] });
  });
});
