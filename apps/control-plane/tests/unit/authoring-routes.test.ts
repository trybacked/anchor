import { describe, expect, it } from "vitest";
import { createControlPlaneApp } from "../../src/app.js";
import type { ControlPlaneConfig } from "../../src/config.js";

const config: ControlPlaneConfig = {
  host: "127.0.0.1",
  port: 8791,
  databaseUrl: "postgresql://unused",
  adminToken: "admin-token-test",
  internalToken: "internal-token-test",
  filesRoot: "./sources",
  filesRegistryRoot: "./.backed/remote-registry",
  sharedSpacesJson: "{}",
  defaultSharedSpaces: [],
};

describe("authoring routes", () => {
  it("registers GET /ontology/draft (401 without auth, not 404)", async () => {
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request(
      "http://localhost/v1/tenants/gerace/authoring/ontology/draft",
      { method: "GET" },
    );
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
  });

  it("registers GET /datasets (401 without auth, not 404)", async () => {
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request("http://localhost/v1/tenants/gerace/authoring/datasets", {
      method: "GET",
    });
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
  });
});
