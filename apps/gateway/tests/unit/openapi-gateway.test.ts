import { describe, expect, it } from "vitest";
import { adaptOpenApiDocumentForGateway } from "../../src/openapi-gateway.js";
describe("adaptOpenApiDocumentForGateway", () => {
  it("prefixes tenant paths with /t/{tenantId} and points servers at the origin", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      {
        paths: {
          "/v1/search/entities": { post: {} },
          "/health": { get: {} },
          "/health/ready": { get: {} },
        },
      },
      { kind: "tenant", tenantId: "gerace" },
      "https://api.backed.app",
    );
    expect(adapted.paths?.["/t/gerace/v1/search/entities"]).toEqual({ post: {} });
    expect(adapted.paths?.["/oauth/authorize"]).toBeDefined();
    expect(adapted.servers).toEqual([
      { url: "https://api.backed.app", description: "Gateway · tenant gerace" },
    ]);
  });
  it("does not double-prefix paths", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      { paths: { "/t/gerace/v1/query/objects": { post: {} } } },
      { kind: "tenant", tenantId: "gerace" },
      "https://api.backed.app",
    );
    expect(adapted.paths?.["/t/gerace/v1/query/objects"]).toEqual({ post: {} });
  });
  it("redefines upstream schemes as the session cookie, leaving requirements untouched", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      {
        paths: { "/v1/search/entities": { post: { security: [{ backedAuth: [] }] } } },
        components: { securitySchemes: { backedAuth: { type: "http", scheme: "bearer" } } },
      },
      { kind: "tenant", tenantId: "gerace" },
      "https://api.backed.app",
    );
    expect(adapted.components?.securitySchemes).toEqual(
      expect.objectContaining({
        backedAuth: expect.objectContaining({ in: "cookie", name: "backed_session" }),
        backedBearer: expect.objectContaining({ scheme: "bearer" }),
      }),
    );
    expect(adapted.paths?.["/t/gerace/v1/search/entities"]).toEqual({
      post: { security: [{ backedAuth: [] }] },
    });
  });
  it("keeps platform browse paths unprefixed and drops health routes", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      {
        paths: {
          "/v1/search/entities": { post: {} },
          "/health/live": { get: {} },
        },
      },
      { kind: "platform" },
      "https://api.backed.app",
    );
    expect(adapted.paths?.["/v1/search/entities"]).toEqual({ post: {} });
    expect(adapted.paths?.["/health/live"]).toMatchObject({
      get: { summary: "Liveness probe" },
    });
    expect(adapted.paths?.["/health"]).toMatchObject({
      get: { summary: "Gateway health" },
    });
    expect(adapted.servers?.[0]?.description).toContain("platform browse");
  });
  it("includes gateway OAuth paths on platform and tenant specs", () => {
    const platform = adaptOpenApiDocumentForGateway(
      { paths: { "/v1/search/entities": { post: {} } } },
      { kind: "platform" },
      "https://api.backed.app",
    );
    expect(platform.paths?.["/oauth/authorize"]).toBeDefined();
    expect(platform.paths?.["/oauth/token"]).toBeDefined();
    const tenant = adaptOpenApiDocumentForGateway(
      { paths: { "/v1/search/entities": { post: {} } } },
      { kind: "tenant", tenantId: "gerace" },
      "https://api.backed.app",
    );
    expect(tenant.paths?.["/oauth/authorize"]).toBeDefined();
  });
});
