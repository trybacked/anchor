import { describe, expect, it } from "vitest";
import {
  adaptOpenApiDocumentForGateway,
  GATEWAY_OPENAPI_SESSION_SCHEME,
} from "../../src/openapi-gateway.js";

describe("adaptOpenApiDocumentForGateway", () => {
  it("prefixes platform paths with /t/{tenantId}", () => {
    const doc = {
      openapi: "3.1.0",
      paths: {
        "/v1/search/entities": { post: {} },
        "/health": { get: {} },
      },
    };
    const adapted = adaptOpenApiDocumentForGateway(doc, "gerace", "https://api.backed.app");
    expect(adapted.paths).toEqual({
      "/t/gerace/v1/search/entities": { post: {} },
      "/t/gerace/health": { get: {} },
    });
    expect(adapted.servers).toEqual([
      { url: "https://api.backed.app", description: "Gateway · tenant gerace" },
    ]);
    const schemes = (adapted.components as { securitySchemes?: Record<string, unknown> })
      .securitySchemes;
    expect(schemes?.[GATEWAY_OPENAPI_SESSION_SCHEME]).toMatchObject({
      in: "cookie",
      name: "backed_session",
    });
  });

  it("does not double-prefix", () => {
    const doc = {
      paths: {
        "/t/gerace/v1/query/objects": { post: {} },
      },
    };
    const adapted = adaptOpenApiDocumentForGateway(doc, "gerace", "https://api.backed.app");
    expect(adapted.paths).toEqual({
      "/t/gerace/v1/query/objects": { post: {} },
    });
  });
});
