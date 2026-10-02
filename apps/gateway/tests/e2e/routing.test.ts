import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileRegistrySource } from "@trybacked/core";
import { afterEach, describe, expect, it } from "vitest";
import { createGatewayApp } from "../../src/app.js";
import type { GatewayConfig } from "../../src/config.js";
import { hashPassword } from "../../src/password.js";

type MockUpstream = {
  baseUrl: string;
  close: () => Promise<void>;
  lastAuthorization: () => string | undefined;
  lastBackedUser: () => string | undefined;
  lastBackedTenant: () => string | undefined;
};

function startMockUpstream(expectedToken: string): Promise<MockUpstream> {
  let authorization: string | undefined;
  let backedUser: string | undefined;
  let backedTenant: string | undefined;

  const server = createServer((req, res) => {
    authorization = req.headers.authorization;
    backedUser = req.headers["x-backed-user"];
    backedTenant = req.headers["x-backed-tenant"];
    if (req.url?.startsWith("/v1/model/entities") === true) {
      if (authorization !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: "contract" }]));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to bind mock upstream"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${String((address as AddressInfo).port)}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error !== undefined) {
                closeReject(error);
              } else {
                closeResolve();
              }
            });
          }),
        lastAuthorization: () => authorization,
        lastBackedUser: () => backedUser,
        lastBackedTenant: () => backedTenant,
      });
    });
  });
}

type RunningGateway = {
  baseUrl: string;
  close: () => Promise<void>;
};

function startGateway(app: ReturnType<typeof createGatewayApp>): Promise<RunningGateway> {
  return new Promise((resolve, reject) => {
    let httpServer: Server | undefined;
    try {
      httpServer = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
        resolve({
          baseUrl: `http://127.0.0.1:${String(info.port)}`,
          close: () =>
            new Promise((closeResolve, closeReject) => {
              if (httpServer === undefined) {
                closeResolve();
                return;
              }
              httpServer.close((error) => {
                if (error !== undefined) {
                  closeReject(error);
                } else {
                  closeResolve();
                }
              });
            }),
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

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

function sessionCookieFromResponse(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/backed_session=([^;]+)/);
  if (match?.[1] === undefined) {
    throw new Error("Missing backed_session cookie");
  }
  return `backed_session=${match[1]}`;
}

describe("gateway e2e routing", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup !== undefined) {
        await cleanup();
      }
    }
  });

  it("login → tenant A OK → tenant B 403 with platform upstream", async () => {
    const platform = await startMockUpstream("platform-token");
    cleanups.push(platform.close);

    const dir = mkdtempSync(join(tmpdir(), "gw-e2e-"));
    const registryPath = writeRegistry(dir);
    const password = "e2e-pass";
    const config: GatewayConfig = {
      host: "127.0.0.1",
      port: 0,
      sessionSecret: "s".repeat(32),
      sessionTtlSeconds: 3600,
      cookieSecure: false,
      tenantsRegistryPath: registryPath,
      usersFilePath: join(dir, "users.yaml"),
      authMode: "file",
      rateLimitPerMinute: 1000,
      platformUpstream: platform.baseUrl,
      platformToken: "platform-token",
    };
    const users = [{ username: "demo", passwordHash: hashPassword(password), tenants: ["gerace"] }];
    const gateway = await startGateway(
      createGatewayApp({ config, registrySource: createFileRegistrySource(registryPath), users }),
    );
    cleanups.push(gateway.close);

    const loginResponse = await fetch(`${gateway.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "demo", password }),
    });
    expect(loginResponse.status).toBe(200);
    const cookie = sessionCookieFromResponse(loginResponse);

    const allowed = await fetch(`${gateway.baseUrl}/t/gerace/v1/model/entities`, {
      headers: { Cookie: cookie },
    });
    expect(allowed.status).toBe(200);
    expect(platform.lastAuthorization()).toBe("Bearer platform-token");
    expect(platform.lastBackedUser()).toBe("demo");
    expect(platform.lastBackedTenant()).toBe("gerace");

    const forbidden = await fetch(`${gateway.baseUrl}/t/backed/v1/model/entities`, {
      headers: { Cookie: cookie },
    });
    expect(forbidden.status).toBe(403);
  });

  it("default tenant proxies /v1 without prefix", async () => {
    const upstream = await startMockUpstream("platform-token");
    cleanups.push(upstream.close);

    const dir = mkdtempSync(join(tmpdir(), "gw-e2e-single-"));
    const registryPath = writeRegistry(dir);
    const password = "single-pass";
    const config: GatewayConfig = {
      host: "127.0.0.1",
      port: 0,
      sessionSecret: "s".repeat(32),
      sessionTtlSeconds: 3600,
      cookieSecure: false,
      tenantsRegistryPath: registryPath,
      usersFilePath: join(dir, "users.yaml"),
      authMode: "file",
      rateLimitPerMinute: 1000,
      platformUpstream: upstream.baseUrl,
      platformToken: "platform-token",
      defaultTenant: "gerace",
    };
    const users = [{ username: "solo", passwordHash: hashPassword(password), tenants: ["gerace"] }];
    const gateway = await startGateway(
      createGatewayApp({ config, registrySource: createFileRegistrySource(registryPath), users }),
    );
    cleanups.push(gateway.close);

    const loginResponse = await fetch(`${gateway.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "solo", password }),
    });
    const cookie = sessionCookieFromResponse(loginResponse);

    const response = await fetch(`${gateway.baseUrl}/v1/model/entities`, {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(upstream.lastAuthorization()).toBe("Bearer platform-token");
    expect(upstream.lastBackedTenant()).toBe("gerace");
    expect(upstream.lastBackedUser()).toBe("solo");
  });
});
