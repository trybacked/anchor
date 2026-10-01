import { describe, expect, it } from "vitest";
import { adaptOpenApiDocumentForGateway } from "../../src/openapi-gateway.js";

describe("adaptOpenApiDocumentForGateway", () => {
  it("prefixes tenant-scoped paths with /t/{tenantId} and points servers at the origin", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      {
        paths: {
          "/v1/search/entities": { post: {} },
          "/health": { get: {} },
          "/health/ready": { get: {} },
        },
      },
      "gerace",
      "https://api.backed.app",
    );

    expect(adapted.paths).toEqual({ "/t/gerace/v1/search/entities": { post: {} } });
    expect(adapted.servers).toEqual([
      { url: "https://api.backed.app", description: "Gateway · tenant gerace" },
    ]);
  });

  it("does not double-prefix paths", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      { paths: { "/t/gerace/v1/query/objects": { post: {} } } },
      "gerace",
      "https://api.backed.app",
    );

    expect(adapted.paths).toEqual({ "/t/gerace/v1/query/objects": { post: {} } });
  });

  it("redefines upstream schemes as the session cookie, leaving requirements untouched", () => {
    const adapted = adaptOpenApiDocumentForGateway(
      {
        paths: { "/v1/search/entities": { post: { security: [{ backedAuth: [] }] } } },
        components: { securitySchemes: { backedAuth: { type: "http", scheme: "bearer" } } },
      },
      "gerace",
      "https://api.backed.app",
    );

    expect(adapted.components?.securitySchemes).toEqual({
      backedAuth: expect.objectContaining({ in: "cookie", name: "backed_session" }),
    });
    expect(adapted.paths?.["/t/gerace/v1/search/entities"]).toEqual({
      post: { security: [{ backedAuth: [] }] },
    });
  });
});
