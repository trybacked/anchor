import { zValidator } from "@hono/zod-validator";
import {
  ChunkSearchBodySchema,
  EntityProfileBodySchema,
  EntitySearchBodySchema,
  GetDefinitionBodySchema,
  GraphTraverseBodySchema,
  ObjectQueryBodySchema,
  SearchModelBodySchema,
  type AnchorService,
} from "@trybacked/service";
import { Hono } from "hono";
import { z } from "zod";
import { createBearerAuthMiddleware } from "./auth.js";

const EntityIdParamSchema = z.object({ id: z.string().min(1) });
const ListRelationsQuerySchema = z.object({ entityId: z.string().optional() });

const SemanticAskBodySchema = z.object({
  question: z.string().min(1),
  evidence: z.boolean().optional(),
});

export type CreateAnchorApiAppOptions = {
  apiToken?: string | undefined;
};

export function createAnchorApiApp(
  getService: () => AnchorService,
  options: CreateAnchorApiAppOptions = {},
): Hono {
  const app = new Hono();
  const auth =
    options.apiToken !== undefined ? createBearerAuthMiddleware(options.apiToken) : undefined;

  app.get("/health", (c) => {
    const service = getService();
    return c.json({ ok: true as const, capabilities: service.capabilities() });
  });

  app.get("/openapi.json", (c) => c.json(buildOpenApiDocument(Boolean(options.apiToken))));

  const v1 = new Hono();
  if (auth !== undefined) {
    v1.use("*", auth);
  }

  v1.get("/model/entities", (c) => c.json(getService().listEntities()));

  v1.get("/model/entities/:id", zValidator("param", EntityIdParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const result = getService().getEntity(id);
    if ("error" in result) {
      return c.json({ error: result.error }, 404);
    }
    return c.json(result);
  });

  v1.get("/model/relations", zValidator("query", ListRelationsQuerySchema), (c) => {
    const { entityId } = c.req.valid("query");
    return c.json(getService().listRelations(entityId));
  });

  v1.post("/model/search", zValidator("json", SearchModelBodySchema), async (c) => {
    const { query } = c.req.valid("json");
    return c.json(await getService().searchModel(query));
  });

  v1.post("/model/definitions", zValidator("json", GetDefinitionBodySchema), (c) => {
    const { term } = c.req.valid("json");
    return c.json(getService().getDefinition(term));
  });

  v1.post("/query/objects", zValidator("json", ObjectQueryBodySchema), async (c) => {
    const body = c.req.valid("json");
    const result = await getService().objectQuery(body);
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/search/entities", zValidator("json", EntitySearchBodySchema), async (c) => {
    const body = c.req.valid("json");
    return c.json(await getService().entitySearch(body));
  });

  v1.post("/search/chunks", zValidator("json", ChunkSearchBodySchema), async (c) => {
    const result = await getService().chunkSearch(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/profile/entities", zValidator("json", EntityProfileBodySchema), async (c) => {
    const result = await getService().entityProfile(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/graph/traverse", zValidator("json", GraphTraverseBodySchema), async (c) => {
    const result = await getService().graphTraverse(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/chat/ask", zValidator("json", SemanticAskBodySchema), async (c) => {
    const service = getService() as AnchorService & {
      semanticAsk?: (body: { question: string; evidence?: boolean }) => Promise<unknown>;
    };
    if (service.semanticAsk === undefined) {
      return c.json({ error: "Semantic chat is unavailable: configure SEMANTIC_CHAT_LLM_* env vars." }, 503);
    }
    const body = c.req.valid("json");
    const answer = await service.semanticAsk({
      question: body.question,
      ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    });
    return c.json(answer);
  });

  app.route("/v1", v1);

  return app;
}

export function buildOpenApiDocument(secured: boolean): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Anchor API",
      version: "0.1.0",
      description:
        "Single HTTP surface for ontology model tools, warehouse object queries, and archive search.",
    },
    ...(secured
      ? {
          components: {
            securitySchemes: {
              bearerAuth: { type: "http", scheme: "bearer" },
            },
          },
          security: [{ bearerAuth: [] }],
        }
      : {}),
    paths: {
      "/health": { get: { operationId: "health", security: [], responses: { "200": { description: "OK" } } } },
      "/openapi.json": {
        get: { operationId: "openApi", security: [], responses: { "200": { description: "OpenAPI document" } } },
      },
      "/v1/model/entities": { get: { operationId: "listEntities", tags: ["model"], responses: { "200": { description: "Entities" } } } },
      "/v1/model/entities/{id}": { get: { operationId: "getEntity", tags: ["model"], responses: { "200": { description: "Entity" }, "404": { description: "Not found" } } } },
      "/v1/model/relations": { get: { operationId: "listRelations", tags: ["model"], responses: { "200": { description: "Relations" } } } },
      "/v1/model/search": { post: { operationId: "searchModel", tags: ["model"], responses: { "200": { description: "Matches" } } } },
      "/v1/model/definitions": { post: { operationId: "getDefinition", tags: ["model"], responses: { "200": { description: "Definition" } } } },
      "/v1/query/objects": { post: { operationId: "objectQuery", tags: ["object-query-reader"], responses: { "200": { description: "Rows or count" } } } },
      "/v1/search/entities": { post: { operationId: "entitySearch", tags: ["entity-search"], responses: { "200": { description: "Matches" } } } },
      "/v1/search/chunks": { post: { operationId: "chunkSearch", tags: ["chunk-search"], responses: { "200": { description: "Matching chunks" }, "503": { description: "Unavailable" } } } },
      "/v1/profile/entities": { post: { operationId: "entityProfile", tags: ["entity-profile-reader"], responses: { "200": { description: "Profile" }, "503": { description: "Unavailable" } } } },
      "/v1/graph/traverse": { post: { operationId: "graphTraverse", tags: ["graph-traverse"], responses: { "200": { description: "Joined rows" }, "503": { description: "Unavailable" } } } },
      "/v1/chat/ask": { post: { operationId: "semanticAsk", tags: ["semantic-chat"], responses: { "200": { description: "Answer with provenance" }, "503": { description: "Unavailable" } } } },
    },
  };
}
