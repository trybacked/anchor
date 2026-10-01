import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../../src/openapi-document.js";

describe("buildOpenApiDocument", () => {
  it("includes JSON request bodies with examples on POST routes", () => {
    const doc = buildOpenApiDocument(true);
    const entitySearch = doc.paths as Record<
      string,
      { post?: { requestBody?: { content?: Record<string, { example?: unknown }> } } }
    >;
    const post = entitySearch["/v1/search/entities"]?.post;
    expect(post?.requestBody?.content?.["application/json"]?.example).toEqual({
      query: "contract",
      kinds: ["entity"],
    });
    expect(doc.components).toBeDefined();
    const schemas = (doc.components as { schemas?: Record<string, unknown> }).schemas;
    expect(schemas?.EntitySearchBody).toBeDefined();
  });
});
