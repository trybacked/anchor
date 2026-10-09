import { emptySemanticModel } from "@trybacked/ontology-authoring";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlPlaneConfig } from "../../src/config.js";

vi.mock("../../src/db/repositories.js", () => ({
  getOrganizationByTenantId: vi.fn(),
  getJob: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock("../../src/db/ontology-repositories.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/db/ontology-repositories.js")>();
  return {
    ...original,
    getOntologyDraft: vi.fn(),
    resolveTenantRole: vi.fn(),
  };
});

import { getOntologyDraft, resolveTenantRole } from "../../src/db/ontology-repositories.js";
import { getOrganizationByTenantId } from "../../src/db/repositories.js";
import { createControlPlaneApp } from "../../src/app.js";

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

const authHeaders = {
  Authorization: `Bearer ${config.internalToken}`,
  "X-Backed-User": "steward@example.com",
};

describe("ontology draft routes", () => {
  beforeEach(() => {
    vi.mocked(getOrganizationByTenantId).mockResolvedValue({
      id: "org-1",
      tenant_id: "gerace",
      catalog: "backed_gerace",
      mcp_name: "backed-gerace",
      shared_spaces: [],
      workos_organization_id: null,
      status: "active",
      service_principal_app_id: null,
      ontology_version: 2,
    });
    vi.mocked(resolveTenantRole).mockResolvedValue("viewer");
  });

  it("returns draft payload and ETag for authorized viewer", async () => {
    const model = emptySemanticModel("gerace");
    vi.mocked(getOntologyDraft).mockResolvedValue({
      tenant_id: "gerace",
      revision: 4,
      model,
      based_on_version: 2,
      updated_by: "steward@example.com",
      updated_at: new Date("2026-06-01T12:00:00.000Z"),
    });
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request(
      "http://localhost/v1/tenants/gerace/authoring/ontology/draft",
      { method: "GET", headers: authHeaders },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"4"');
    const body = (await response.json()) as {
      revision: number;
      basedOnVersion: number | null;
      model: { metadata: { runId: string } };
    };
    expect(body.revision).toBe(4);
    expect(body.basedOnVersion).toBe(2);
    expect(body.model.metadata.runId).toBe("gerace");
  });

  it("returns 403 when role is below required minimum", async () => {
    vi.mocked(resolveTenantRole).mockResolvedValue("viewer");
    vi.mocked(getOntologyDraft).mockResolvedValue({
      tenant_id: "gerace",
      revision: 1,
      model: emptySemanticModel("gerace"),
      based_on_version: null,
      updated_by: "steward@example.com",
      updated_at: new Date(),
    });
    const app = createControlPlaneApp(config, {} as never);
    const response = await app.request("http://localhost/v1/tenants/gerace/authoring/members", {
      method: "GET",
      headers: authHeaders,
    });
    expect(response.status).toBe(403);
  });
});
