import { describe, expect, it, vi } from "vitest";
import { AnchorApiError, createAnchorClient } from "../../src/client.js";
import type { SemanticAskResponse } from "@trybacked/service";
const askPayload: SemanticAskResponse = {
  text: "There are 3 contracts.",
  question: "How many contracts?",
  route: "single",
  plan: { objectId: "contract", mode: "count" },
  result: {
    objectId: "contract",
    columns: ["count"],
    rows: [{ count: 3 }],
    rowCount: 1,
    mode: "count",
    sql: "SELECT COUNT(*) FROM contract",
  },
  provenance: [],
  ontologyVersion: 2,
  parameterNames: [],
  attempts: 1,
  steps: [{ id: "q1", type: "objectQuery", rowCount: 1, sql: "SELECT COUNT(*)" }],
};
describe("createAnchorClient", () => {
  it("returns typed ask response", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(askPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const client = createAnchorClient({ baseUrl: "http://gw/t/gerace/", fetch: fetchImpl });
    const answer = await client.ask({ question: "How many contracts?" });
    expect(answer.route).toBe("single");
    expect(answer.steps).toHaveLength(1);
    expect(answer.text).toContain("3");
  });
  it("throws AnchorApiError with API error message", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    const onUnauthorized = vi.fn();
    const client = createAnchorClient({
      baseUrl: "http://gw",
      fetch: fetchImpl,
      onUnauthorized,
    });
    await expect(client.listEntities()).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    const error = onUnauthorized.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AnchorApiError);
  });
  it("passes credentials to fetch", async () => {
    let seenCredentials: RequestInit["credentials"];
    const fetchImpl: typeof fetch = async (_input, init) => {
      seenCredentials = init?.credentials;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createAnchorClient({
      baseUrl: "http://gw/t/gerace",
      fetch: fetchImpl,
      credentials: "include",
    });
    await client.listEntities();
    expect(seenCredentials).toBe("include");
  });
  it("strips trailing slash from baseUrl", async () => {
    let seenUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      seenUrl = String(input);
      return new Response(JSON.stringify({ ok: true, capabilities: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createAnchorClient({ baseUrl: "http://gw/", fetch: fetchImpl });
    await client.health();
    expect(seenUrl).toBe("http://gw/health");
  });
});
