import { serviceError } from "@trybacked/service";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { postJsonRoute, postServiceJsonRoute } from "../../src/platform-api-route-factory.js";
import { jsonBody } from "../../src/platform-api-route-meta.js";
describe("platform-api route factory", () => {
  it("postJsonRoute sets method post and parses body with jsonBody.schema", async () => {
    const schema = z.object({ n: z.number() });
    const factory = postJsonRoute(
      {
        operationId: "demo",
        path: "/v1/demo",
        summary: "demo",
        jsonBody: jsonBody("DemoBody", schema, { n: 1 }),
        responses: { "200": { description: "OK" } },
      },
      (_c, body) => Response.json(body),
    );
    expect(factory.meta.method).toBe("post");
    const handle = factory.createHandler({
      getService: () => {
        throw new Error("unused");
      },
      platformRegistry: undefined,
      serveOpenApiDocument: () => ({}),
    });
    const response = await handle({
      req: { json: async () => ({ n: 42 }) },
      json: (data: unknown) => Response.json(data),
      get: () => {
        throw new Error("unused");
      },
    } as never);
    expect(await response.json()).toEqual({ n: 42 });
  });
  it("postServiceJsonRoute maps service errors to JSON status", async () => {
    const schema = z.object({ q: z.string() });
    const factory = postServiceJsonRoute(
      {
        operationId: "demoErr",
        path: "/v1/demo-err",
        summary: "demo",
        jsonBody: jsonBody("DemoErrBody", schema, { q: "x" }),
        responses: { "200": { description: "OK" }, "503": { description: "Unavailable" } },
      },
      async (_service, body) =>
        body.q === "fail" ? serviceError("unavailable", "feature unavailable") : { ok: true },
    );
    const service = {} as never;
    const handle = factory.createHandler({
      getService: () => service,
      platformRegistry: undefined,
      serveOpenApiDocument: () => ({}),
    });
    const honoJson = (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), {
        status: status ?? 200,
        headers: { "content-type": "application/json" },
      });
    const fail = await handle({
      req: { json: async () => ({ q: "fail" }) },
      json: honoJson,
      get: () => service,
    } as never);
    expect(fail.status).toBe(503);
    const ok = await handle({
      req: { json: async () => ({ q: "ok" }) },
      json: honoJson,
      get: () => service,
    } as never);
    expect(await ok.json()).toEqual({ ok: true });
  });
});
