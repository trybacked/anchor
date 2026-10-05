import { describe, expect, it, vi } from "vitest";
import { createBackedClient } from "../../src/client.js";
describe("createBackedClient", () => {
  it("gateway tenant scopes paths under /t/{id}/v1", async () => {
    let seenUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      seenUrl = String(input);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createBackedClient({
      mode: "gateway",
      baseUrl: "http://gw",
      fetch: fetchImpl,
      credentials: "include",
    });
    await client.tenant("gerace").model.listEntities();
    expect(seenUrl).toBe("http://gw/t/gerace/v1/model/entities");
  });
  it("platform tenant sends X-Backed-Tenant header", async () => {
    let seenHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenHeaders = init?.headers;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createBackedClient({
      mode: "platform",
      baseUrl: "http://api",
      token: "secret",
      fetch: fetchImpl,
    });
    await client.tenant("gerace").model.listEntities();
    expect(seenHeaders).toMatchObject({
      Authorization: "Bearer secret",
      "X-Backed-Tenant": "gerace",
    });
  });
  it("auth login posts credentials to gateway", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ username: "demo", tenants: ["gerace"] }));
    const client = createBackedClient({
      mode: "gateway",
      baseUrl: "http://gw",
      fetch: fetchImpl as typeof fetch,
    });
    const session = await client.auth.loginWithPassword({
      username: "demo",
      password: "x",
    });
    expect(session.tenants).toContain("gerace");
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://gw/login");
  });
});
