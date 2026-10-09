import { createAnchorService } from "@trybacked/service";
import { readModelYaml } from "@trybacked/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnchorApiApp } from "../../src/app.js";
import {
  OntologyNotPublishedError,
  TenantNotFoundError,
  type TenantRuntimeRegistry,
} from "../../src/tenant-runtime-registry.js";
const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/pmi-minimal",
);
function mockRegistry(overrides: Partial<TenantRuntimeRegistry> = {}): TenantRuntimeRegistry {
  const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
  return {
    listTenantIds: async () => ["demo"],
    cachedTenantIds: () => [],
    resolve: async () => service,
    invalidate: () => undefined,
    ...overrides,
  };
}
describe("Anchor API app (platform mode)", () => {
  it("requires X-Backed-Tenant after auth", async () => {
    const app = createAnchorApiApp(
      () => {
        throw new Error("unused");
      },
      {
        apiToken: "test-token-secret",
        platform: { registry: mockRegistry() },
      },
    );
    const response = await app.request("/v1/model/entities", {
      headers: { Authorization: "Bearer test-token-secret" },
    });
    expect(response.status).toBe(400);
  });
  it("returns 404 for unknown tenant", async () => {
    const app = createAnchorApiApp(
      () => {
        throw new Error("unused");
      },
      {
        apiToken: "test-token-secret",
        platform: {
          registry: mockRegistry({
            resolve: async () => {
              throw new TenantNotFoundError("missing");
            },
          }),
        },
      },
    );
    const response = await app.request("/v1/model/entities", {
      headers: {
        Authorization: "Bearer test-token-secret",
        "X-Backed-Tenant": "missing",
      },
    });
    expect(response.status).toBe(404);
  });
  it("returns 503 when ontology not published", async () => {
    const app = createAnchorApiApp(
      () => {
        throw new Error("unused");
      },
      {
        apiToken: "test-token-secret",
        platform: {
          registry: mockRegistry({
            resolve: async () => {
              throw new OntologyNotPublishedError("demo", "backed_demo");
            },
          }),
        },
      },
    );
    const response = await app.request("/v1/model/entities", {
      headers: {
        Authorization: "Bearer test-token-secret",
        "X-Backed-Tenant": "demo",
      },
    });
    expect(response.status).toBe(503);
  });
  it("allows protected routes with tenant header", async () => {
    const app = createAnchorApiApp(
      () => {
        throw new Error("unused");
      },
      {
        apiToken: "test-token-secret",
        platform: { registry: mockRegistry() },
      },
    );
    const response = await app.request("/v1/model/entities", {
      headers: {
        Authorization: "Bearer test-token-secret",
        "X-Backed-Tenant": "demo",
      },
    });
    expect(response.status).toBe(200);
  });
  it("resolves anchorService for chat ask status (not file-only tenant mode)", async () => {
    const app = createAnchorApiApp(
      () => {
        throw new Error("unused");
      },
      {
        apiToken: "test-token-secret",
        platform: { registry: mockRegistry() },
      },
    );
    const response = await app.request("/v1/chat/ask/status", {
      headers: {
        Authorization: "Bearer test-token-secret",
        "X-Backed-Tenant": "demo",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      available: false,
      reason: "missing_llm_gateway",
    });
  });
});
