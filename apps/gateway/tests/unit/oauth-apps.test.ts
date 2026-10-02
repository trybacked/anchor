import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createFileRegistrySource } from "@trybacked/core";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createGatewayApp } from "../../src/app.js";
import type { GatewayConfig } from "../../src/config.js";
import { createAuthorizationCode } from "../../src/oauth-codes.js";
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
    authMode: "workos",
    rateLimitPerMinute: 100,
    platformUpstream: "http://127.0.0.1:8797",
    platformToken: "platform-token",
    workosApiKey: "sk_test",
    workosClientId: "client_test",
    workosRedirectUri: "http://127.0.0.1:8790/callback",
    controlPlaneUrl: "http://127.0.0.1:8791",
    controlPlaneInternalToken: "internal-token",
  };
}

const mockClient = {
  clientId: "chiedi-dev",
  name: "Chiedi Dev",
  redirectUris: ["http://localhost:3000/login/complete"],
  corsOrigins: ["http://localhost:3000"],
  clientSecretHash: null,
};

describe("oauth apps", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v1/oauth-clients")) {
        return new Response(JSON.stringify({ clients: [mockClient] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rejects authorize when PKCE is missing for public client", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-oauth-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
    });

    const response = await app.request(
      "http://127.0.0.1/oauth/authorize?response_type=code&client_id=chiedi-dev&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Flogin%2Fcomplete&state=abc",
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("pkce_required");
  });

  it("exchanges authorization code for bearer access token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-oauth-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
    });

    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
    const code = await createAuthorizationCode(
      config.sessionSecret,
      {
        username: "user@example.com",
        tenants: ["gerace"],
        clientId: "chiedi-dev",
        redirectUri: "http://localhost:3000/login/complete",
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
      },
      120,
    );

    const response = await app.request("http://127.0.0.1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: "chiedi-dev",
        redirect_uri: "http://localhost:3000/login/complete",
        code_verifier: verifier,
      }),
    });
    expect(response.status).toBe(200);
    const tokenPayload = (await response.json()) as {
      access_token: string;
      token_type: string;
    };
    expect(tokenPayload.token_type).toBe("Bearer");

    const me = await app.request("http://127.0.0.1/me", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    expect(me.status).toBe(200);
    const session = (await me.json()) as { username: string; tenants: string[] };
    expect(session.username).toBe("user@example.com");
    expect(session.tenants).toEqual(["gerace"]);
  });

  it("allows CORS preflight for registered origin on /me", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-oauth-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
    });

    const response = await app.request("http://127.0.0.1/me", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("accepts bearer token on tenant proxy route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-oauth-"));
    const registryPath = writeRegistry(dir);
    const config = baseConfig(dir, registryPath);
    const token = await createSessionToken(
      config.sessionSecret,
      { username: "user@example.com", tenants: ["gerace"] },
      3600,
    );
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = createGatewayApp({
      config,
      registrySource: createFileRegistrySource(registryPath),
      proxyDeps: { fetchImpl },
    });

    const response = await app.request("http://127.0.0.1/t/gerace/v1/model/entities", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });
});
