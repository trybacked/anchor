import type { DatabricksProviderConfig } from "@trybacked/provider-databricks";
import { describe, expect, it, vi } from "vitest";
import { createOboToken, ensureServicePrincipal } from "../../src/databricks-admin-client.js";

const config: DatabricksProviderConfig = {
  host: "example.cloud.databricks.com",
  token: "pat-test",
  warehouseId: "wh-1",
};

describe("ensureServicePrincipal", () => {
  it("reuses existing principal and patches entitlement", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("ServicePrincipals?") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            Resources: [
              {
                id: "scim-1",
                applicationId: "app-1",
                displayName: "backed-tenant-gerace",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/ServicePrincipals/scim-1") && init?.method === "PATCH") {
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    const result = await ensureServicePrincipal(config, "backed-tenant-gerace", {
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result).toEqual({ applicationId: "app-1", scimId: "scim-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("createOboToken", () => {
  it("grants CAN_USE then creates OBO token", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/permissions/authorization/tokens")) {
        return new Response("", { status: 200 });
      }
      if (url.includes("/on-behalf-of/tokens") && init?.method === "POST") {
        return new Response(JSON.stringify({ token_value: "obo-secret" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const token = await createOboToken(config, "app-1", "backed gerace", {
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(token).toBe("obo-secret");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
