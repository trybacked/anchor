import { createAnchorService } from "@trybacked/service";
import { readModelYaml } from "@trybacked/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAnchorApiApp } from "../../src/app.js";
const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/pmi-minimal",
);
describe("Anchor API app", () => {
  const service = createAnchorService({ model: readModelYaml(fixtureRoot) });
  const app = createAnchorApiApp(() => service, { apiToken: "test-token-secret" });
  it("allows liveness without auth", async () => {
    const response = await app.request("/health/live");
    expect(response.status).toBe(200);
  });
  it("allows readiness health without auth", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
  });
  it("rejects protected routes without bearer token", async () => {
    const response = await app.request("/v1/model/entities");
    expect(response.status).toBe(401);
  });
  it("allows protected routes with bearer token", async () => {
    const response = await app.request("/v1/model/entities", {
      headers: { Authorization: "Bearer test-token-secret" },
    });
    expect(response.status).toBe(200);
  });
});
