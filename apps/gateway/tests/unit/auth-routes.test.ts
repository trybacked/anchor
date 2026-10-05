import { describe, expect, it } from "vitest";
import { createGatewayApp } from "../../src/app.js";
import type { GatewayConfig } from "../../src/config.js";
import { hashPassword } from "../../src/password.js";
import { mockRegistrySource } from "../helpers/registry-source.js";
const config: GatewayConfig = {
  host: "127.0.0.1",
  port: 8790,
  sessionSecret: "s".repeat(32),
  sessionTtlSeconds: 3600,
  cookieSecure: false,
  tenantsRegistryPath: "/dev/null",
  usersFilePath: "/dev/null",
  authMode: "file",
  rateLimitPerMinute: 60,
  platformUpstream: "http://127.0.0.1:1",
  platformToken: "t",
};
const registrySource = mockRegistrySource({
  enrollment: {
    host: "https://example.databricks.com",
    profile: "DEFAULT",
    warehouse_id: "wh",
  },
  shared_spaces: {},
  tenants: {},
});
describe("auth routes", () => {
  const users = [{ username: "demo", passwordHash: hashPassword("pass"), tenants: ["gerace"] }];
  it("login sets session cookie", async () => {
    const app = createGatewayApp({
      config,
      registrySource,
      users,
      proxyDeps: { fetchImpl: async () => new Response("{}") },
    });
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "pass" }),
    });
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("backed_session=");
  });
  it("GET /logout clears session and redirects to login", async () => {
    const app = createGatewayApp({
      config,
      registrySource,
      users,
      proxyDeps: { fetchImpl: async () => new Response("{}") },
    });
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "pass" }),
    });
    const sessionCookie = login.headers.get("set-cookie") ?? "";
    const response = await app.request("/logout", {
      headers: { Cookie: sessionCookie.split(";")[0] ?? "" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });
  it("POST /logout returns ok", async () => {
    const app = createGatewayApp({ config, registrySource, users });
    const response = await app.request("/logout", { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("rejects bad password", async () => {
    const app = createGatewayApp({ config, registrySource, users });
    const response = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "nope" }),
    });
    expect(response.status).toBe(401);
  });
});
