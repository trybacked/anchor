import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi-document.js";
const JSON_MEDIA_TYPE = "application/json";
type Operation = {
  requestBody?: {
    content?: Record<
      string,
      {
        example?: unknown;
      }
    >;
  };
};
function postOperations(): [string, Operation][] {
  const paths = buildOpenApiDocument(true).paths as Record<
    string,
    {
      post?: Operation;
    }
  >;
  return Object.entries(paths).flatMap(([path, item]) =>
    item.post === undefined ? [] : [[path, item.post] as [string, Operation]],
  );
}
describe("buildOpenApiDocument", () => {
  it("gives every JSON POST body a non-empty example", () => {
    const jsonBodies = postOperations().flatMap(([path, post]) => {
      const body = post.requestBody?.content?.[JSON_MEDIA_TYPE];
      return body === undefined ? [] : [[path, body.example] as [string, unknown]];
    });
    expect(jsonBodies.length).toBeGreaterThan(0);
    for (const [path, example] of jsonBodies) {
      expect(typeof example, `${path} request body example`).toBe("object");
      expect(Object.keys(example as object).length, `${path} example keys`).toBeGreaterThan(0);
    }
  });
  it("exposes the entity search body schema and an example shaped like it", () => {
    const doc = buildOpenApiDocument(true);
    const schemas = (
      doc.components as {
        schemas?: Record<string, unknown>;
      }
    ).schemas;
    expect(schemas?.["EntitySearchBody"]).toBeDefined();
    const search = postOperations().find(([path]) => path === "/v1/search/entities");
    const example = search?.[1].requestBody?.content?.[JSON_MEDIA_TYPE]?.example;
    expect(Object.keys(example as object).sort()).toEqual(["kinds", "query"]);
  });
});
