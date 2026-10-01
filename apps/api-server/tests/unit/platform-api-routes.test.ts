import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi-document.js";
import { platformApiRouteSpecs } from "../../src/platform-api-routes.js";

describe("platformApiRouteSpecs", () => {
  it("stays aligned with the generated OpenAPI paths", () => {
    const doc = buildOpenApiDocument(true);
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    const routes = platformApiRouteSpecs();

    for (const route of routes) {
      expect(paths[route.path]?.[route.method]).toBeDefined();
    }

    expect(Object.keys(paths).sort()).toEqual(
      [...new Set(routes.map((route) => route.path))].sort(),
    );
  });

  it("uses unique operation ids", () => {
    const ids = platformApiRouteSpecs().map((route) => route.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
