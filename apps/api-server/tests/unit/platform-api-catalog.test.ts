import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi-document.js";
import { PLATFORM_API_CATALOG, PLATFORM_OPERATION_IDS } from "../../src/platform-api-catalog.js";

describe("PLATFORM_API_CATALOG", () => {
  it("stays aligned with the generated OpenAPI paths", () => {
    const doc = buildOpenApiDocument(true);
    const paths = doc.paths as Record<string, Record<string, unknown>>;

    for (const route of PLATFORM_API_CATALOG) {
      expect(paths[route.path]?.[route.method]).toBeDefined();
    }

    expect(Object.keys(paths).sort()).toEqual(
      [...new Set(PLATFORM_API_CATALOG.map((route) => route.path))].sort(),
    );
  });

  it("uses unique operation ids", () => {
    const ids = PLATFORM_API_CATALOG.map((route) => route.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists every catalog operation in PLATFORM_OPERATION_IDS", () => {
    const catalogIds = PLATFORM_API_CATALOG.map((route) => route.operationId).sort();
    expect([...PLATFORM_OPERATION_IDS].sort()).toEqual(catalogIds);
  });
});
