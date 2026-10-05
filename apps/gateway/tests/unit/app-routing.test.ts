import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileRegistrySource } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { createGatewayApp } from "../../src/app.js";
import type { GatewayConfig } from "../../src/config.js";
import { hashPassword } from "../../src/password.js";
import { createSessionToken } from "../../src/session.js";
function writeRegistry(dir: string): string {
  const path = join(dir, "tenants.yaml");
  writeFileSync(
    path,
    `enrollment:
  host: https://example.databricks.com
  profile: DEFAULT
  warehouse_id: wh
shared_spaces: {}
tenants:
  gerace:
    catalog: backed_gerace
    mcp: backed-gerace
    shared: []
  backed:
    catalog: backed
    mcp: backed-backed
    shared: []
`,
    "utf8",
  );
  return path;
}
function baseConfig(dir: string, registryPath: string): GatewayConfig {
  return {
    host: "127.0.0.1",
    port: 8790,
    sessionSecret: "s".repeat(32),
    sessionTtlSeconds: 3600,
    cookieSecure: false,
    tenantsRegistryPath: registryPath,
    usersFilePath: join(dir, "users.yaml"),
    authMode: "file",
    rateLimitPerMinute: 100,
    platformUpstream: "http://127.0.0.1:8797",
    platformToken: "platform-token",
  };
}
describe("gateway routing", () => {
  it("returns 403 for tenant not in user list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const token = await createSessionToken(
      config.sessionSecret,
      { username: "u", tenants: ["gerace"] },
      3600,
    );
    const fetchImpl: typeof fetch = async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
      proxyDeps: { fetchImpl },
    });
    const response = await app.request("/t/backed/v1/model/entities", {
      headers: { Cookie: `backed_session=${token}` },
    });
    expect(response.status).toBe(403);
  });
  it("proxies authorized tenant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const token = await createSessionToken(
      config.sessionSecret,
      { username: "u", tenants: ["gerace"] },
      3600,
    );
    let proxied = false;
    let tenantHeader: string | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      proxied = String(input).includes("/v1/model/entities");
      const headers = init?.headers;
      if (headers instanceof Headers) {
        tenantHeader = headers.get("x-backed-tenant") ?? undefined;
      }
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
      proxyDeps: { fetchImpl },
    });
    const response = await app.request("/t/gerace/v1/model/entities", {
      headers: { Cookie: `backed_session=${token}` },
    });
    expect(response.status).toBe(200);
    expect(proxied).toBe(true);
    expect(tenantHeader).toBe("gerace");
  });
  it("default tenant serves /v1 without tenant prefix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config: GatewayConfig = {
      ...baseConfig(dir, registryPath),
      defaultTenant: "gerace",
    };
    const token = await createSessionToken(
      config.sessionSecret,
      { username: "u", tenants: ["gerace"] },
      3600,
    );
    let proxied = false;
    const fetchImpl: typeof fetch = async (input) => {
      proxied = String(input).endsWith("/v1/model/entities");
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
      proxyDeps: { fetchImpl },
    });
    const response = await app.request("/v1/model/entities", {
      headers: { Cookie: `backed_session=${token}` },
    });
    expect(response.status).toBe(200);
    expect(proxied).toBe(true);
  });
  it("redirects trailing slash on /docs/", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs/");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/docs");
  });
  it("redirects /docs to platform browse when registry has no tenants", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    writeFileSync(
      join(dir, "tenants.yaml"),
      `enrollment:
  host: https://example.databricks.com
  profile: DEFAULT
  warehouse_id: wh
shared_spaces: {}
tenants: {}
`,
      "utf8",
    );
    const registryPath = join(dir, "tenants.yaml");
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/docs/platform");
  });
  it("redirects legacy /docs/t/reference to platform browse", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    writeFileSync(
      join(dir, "tenants.yaml"),
      `enrollment:
  host: https://example.databricks.com
  profile: DEFAULT
  warehouse_id: wh
shared_spaces: {}
tenants: {}
`,
      "utf8",
    );
    const registryPath = join(dir, "tenants.yaml");
    const app = createGatewayApp({
      config: baseConfig(dir, registryPath),
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs/t/reference");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/docs/platform");
  });
  it("serves public docs picker without session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("/docs/t/gerace");
    expect(html).toContain("/docs/t/backed");
  });
  it("serves platform Scalar docs at /docs/platform when tenants exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs/platform");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Scalar");
    expect(html).toContain("/openapi.json");
  });
  it("serves Scalar docs without login", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/docs/t/gerace");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Scalar");
    expect(html).toContain("/t/gerace/openapi.json");
  });
  it("serves openapi.json without session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const fetchImpl: typeof fetch = async () =>
      new Response('{"openapi":"3.1.0"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
      proxyDeps: { fetchImpl },
    });
    const response = await app.request("/t/gerace/openapi.json");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.servers).toEqual([
      { url: "http://localhost", description: "Gateway · tenant gerace" },
    ]);
  });
  it("multi mode does not expose /v1 at root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const token = await createSessionToken(
      config.sessionSecret,
      { username: "u", tenants: ["gerace"] },
      3600,
    );
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      users: [{ username: "u", passwordHash: hashPassword("p"), tenants: ["gerace"] }],
    });
    const response = await app.request("/v1/model/entities", {
      headers: { Cookie: `backed_session=${token}` },
    });
    expect(response.status).toBe(404);
  });
});
