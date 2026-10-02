import { describe, expect, it } from "vitest";
import { forwardToPlatform, tenantPathFromRequest } from "../../src/proxy.js";
import type { GatewayConfig } from "../../src/config.js";

const platformConfig: GatewayConfig = {
  host: "127.0.0.1",
  port: 0,
  sessionSecret: "s".repeat(32),
  sessionTtlSeconds: 3600,
  cookieSecure: false,
  tenantsRegistryPath: "/tmp/tenants.yaml",
  usersFilePath: "/tmp/users.yaml",
  authMode: "file",
  rateLimitPerMinute: 60,
  platformUpstream: "http://127.0.0.1:8797",
  platformToken: "upstream-token",
};

describe("proxy", () => {
  it("rewrites path for tenant prefix", () => {
    expect(tenantPathFromRequest("/t/gerace/v1/model/entities", "gerace")).toBe(
      "/v1/model/entities",
    );
  });

  it("forwards with bearer, user, and tenant headers", async () => {
    let seenAuth: string | null = null;
    let seenUser: string | null = null;
    let seenTenant: string | null = null;
    let seenUrl: string | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenAuth = init?.headers instanceof Headers ? init.headers.get("authorization") : null;
      seenUser = init?.headers instanceof Headers ? init.headers.get("x-backed-user") : null;
      seenTenant = init?.headers instanceof Headers ? init.headers.get("x-backed-tenant") : null;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const request = new Request("http://gateway/t/gerace/v1/model/entities", { method: "GET" });
    const response = await forwardToPlatform(
      platformConfig,
      "gerace",
      "demo",
      request,
      "/v1/model/entities",
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(seenUrl).toBe("http://127.0.0.1:8797/v1/model/entities");
    expect(seenAuth).toBe("Bearer upstream-token");
    expect(seenUser).toBe("demo");
    expect(seenTenant).toBe("gerace");
  });

  it("forwards multipart POST body to platform-api", async () => {
    let seenMethod: string | undefined;
    let bodyLength = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenMethod = init?.method;
      if (init?.body instanceof ArrayBuffer) {
        bodyLength = init.body.byteLength;
      }
      return new Response(JSON.stringify({ path: "/Volumes/x/docs/raw/a.pdf" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3])]), "a.pdf");
    const request = new Request("http://gateway/t/gerace/v1/files", {
      method: "POST",
      body: form,
    });
    const response = await forwardToPlatform(
      platformConfig,
      "gerace",
      "demo",
      request,
      "/v1/files",
      { fetchImpl },
    );
    expect(response.status).toBe(201);
    expect(seenMethod).toBe("POST");
    expect(bodyLength).toBeGreaterThan(0);
  });

  it("omits tenant header when tenant id is undefined", async () => {
    let seenTenant: string | null = "unset";
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenTenant = init?.headers instanceof Headers ? init.headers.get("x-backed-tenant") : null;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    const request = new Request("http://gateway/v1/health", { method: "GET" });
    await forwardToPlatform(platformConfig, undefined, "demo", request, "/v1/health", {
      fetchImpl,
    });
    expect(seenTenant).toBeNull();
  });
});
