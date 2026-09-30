import { describe, expect, it } from "vitest";
import { forwardToUpstream, tenantPathFromRequest } from "../../src/proxy.js";

describe("proxy", () => {
  it("rewrites path for tenant prefix", () => {
    expect(tenantPathFromRequest("/t/gerace/v1/model/entities", "gerace")).toBe(
      "/v1/model/entities",
    );
  });

  it("forwards with bearer and user header", async () => {
    let seenAuth: string | null = null;
    let seenUser: string | null = null;
    let seenUrl: string | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      seenUrl = String(input);
      seenAuth = init?.headers instanceof Headers ? init.headers.get("authorization") : null;
      seenUser = init?.headers instanceof Headers ? init.headers.get("x-backed-user") : null;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const request = new Request("http://gateway/t/gerace/v1/model/entities", { method: "GET" });
    const response = await forwardToUpstream(
      { tenantId: "gerace", baseUrl: "http://127.0.0.1:8797", token: "upstream-token" },
      "demo",
      request,
      "/v1/model/entities",
      { fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(seenUrl).toBe("http://127.0.0.1:8797/v1/model/entities");
    expect(seenAuth).toBe("Bearer upstream-token");
    expect(seenUser).toBe("demo");
  });
});
