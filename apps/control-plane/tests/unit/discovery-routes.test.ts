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

describe("discovery routes", () => {
  it("registers GET /docs/status (401 without internal token, not 404)", async () => {
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request(
      "http://localhost/v1/tenants/gerace/authoring/discovery/docs/status",
      { method: "GET" },
    );
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
  });

  it("registers POST /docs/propose-ai (401 without internal token, not 404)", async () => {
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request(
      "http://localhost/v1/tenants/gerace/authoring/discovery/docs/propose-ai",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "it" }),
      },
    );
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
  });
});
