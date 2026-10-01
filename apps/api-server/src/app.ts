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
  type SemanticAskResponse,
} from "@trybacked/service";
import { Hono } from "hono";
import { z } from "zod";
import { createBearerAuthMiddleware } from "./auth.js";
import { runWithRequestContext } from "./request-context.js";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";
import { OntologyNotPublishedError, TenantNotFoundError } from "./tenant-runtime-registry.js";

type AnchorApiVariables = {
  anchorService: AnchorService;
};

const EntityIdParamSchema = z.object({ id: z.string().min(1) });
const DocumentIdParamSchema = z.object({ id: z.string().min(1) });
const ListRelationsQuerySchema = z.object({ entityId: z.string().optional() });
const DocumentPreviewQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  format: z.enum(["json", "file"]).optional(),
});

function documentErrorStatus(message: string): 400 | 404 | 503 {
  if (message.includes("not found")) {
    return 404;
  }
  if (message.includes("unavailable")) {
    return 503;
  }
  return 400;
}

const SemanticAskBodySchema = z.object({
  question: z.string().min(1),
  evidence: z.boolean().optional(),
});

export type CreateAnchorApiAppOptions = {
  apiToken?: string | undefined;
  platform?: { registry: TenantRuntimeRegistry } | undefined;
};

export function createAnchorApiApp(
  getService: () => AnchorService,
  options: CreateAnchorApiAppOptions = {},
): Hono<{ Variables: AnchorApiVariables }> {
  const app = new Hono<{ Variables: AnchorApiVariables }>();
  const auth =
    options.apiToken !== undefined ? createBearerAuthMiddleware(options.apiToken) : undefined;

  app.get("/health/live", (c) => c.json({ ok: true as const }));

  app.get("/health", async (c) => {
    if (options.platform !== undefined) {
      return c.json({
        ok: true as const,
        mode: "platform" as const,
        tenants: await options.platform.registry.listTenantIds(),
        cachedTenants: options.platform.registry.cachedTenantIds(),
      });
    }
    const service = getService();
    return c.json({
      ok: true as const,
      mode: "workspace" as const,
      capabilities: service.capabilities(),
    });
  });

  app.get("/health/ready", async (c) => {
    if (options.platform !== undefined) {
      return c.json({
        ok: true as const,
        mode: "platform" as const,
        tenants: await options.platform.registry.listTenantIds(),
      });
    }
    const service = getService();
    const capabilities = service.capabilities();
    return c.json({ ok: true as const, mode: "workspace" as const, capabilities });
  });

  app.get("/openapi.json", (c) => c.json(buildOpenApiDocument(Boolean(options.apiToken))));

  const v1 = new Hono<{ Variables: AnchorApiVariables }>();
  const serviceFor = (c: { get: (key: "anchorService") => AnchorService }) =>
    c.get("anchorService");

  if (auth !== undefined) {
    v1.use("*", auth);
  }

  if (options.platform !== undefined) {
    const platformRegistry = options.platform.registry;
    v1.use("*", async (c, next) => {
      const headerUser = c.req.header("X-Backed-User")?.trim();
      const user = headerUser !== undefined && headerUser.length > 0 ? headerUser : undefined;
      const tenant = c.req.header("X-Backed-Tenant")?.trim();
      if (tenant === undefined || tenant.length === 0) {
        return c.json({ error: "Missing X-Backed-Tenant header" }, 400);
      }
      try {
        const anchorService = await platformRegistry.resolve(tenant);
        c.set("anchorService", anchorService);
        // eslint-disable-next-line @typescript-eslint/return-await -- ALS wrapper; Hono next() return type is not a Thenable
        return runWithRequestContext({ user, tenant }, () => next());
      } catch (error) {
        if (error instanceof TenantNotFoundError) {
          return c.json({ error: error.message }, 404);
        }
        if (error instanceof OntologyNotPublishedError) {
          return c.json({ error: error.message }, 503);
        }
        throw error;
      }
    });
  } else {
    v1.use("*", async (c, next) => {
      const headerUser = c.req.header("X-Backed-User")?.trim();
      const user = headerUser !== undefined && headerUser.length > 0 ? headerUser : undefined;
      c.set("anchorService", getService());
      return runWithRequestContext({ user }, () => next());
    });
  }

  v1.get("/model/entities", (c) => c.json(serviceFor(c).listEntities()));

  v1.get("/model/entities/:id", zValidator("param", EntityIdParamSchema), (c) => {
    const { id } = c.req.valid("param");
    const result = serviceFor(c).getEntity(id);
    if ("error" in result) {
      return c.json({ error: result.error }, 404);
    }
    return c.json(result);
  });

  v1.get("/model/relations", zValidator("query", ListRelationsQuerySchema), (c) => {
    const { entityId } = c.req.valid("query");
    return c.json(serviceFor(c).listRelations(entityId));
  });

  v1.post("/model/search", zValidator("json", SearchModelBodySchema), async (c) => {
    const { query } = c.req.valid("json");
    return c.json(await serviceFor(c).searchModel(query));
  });

  v1.post("/model/definitions", zValidator("json", GetDefinitionBodySchema), (c) => {
    const { term } = c.req.valid("json");
    return c.json(serviceFor(c).getDefinition(term));
  });

  v1.post("/query/objects", zValidator("json", ObjectQueryBodySchema), async (c) => {
    const body = c.req.valid("json");
    const result = await serviceFor(c).objectQuery(body);
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/search/entities", zValidator("json", EntitySearchBodySchema), async (c) => {
    const body = c.req.valid("json");
    return c.json(await serviceFor(c).entitySearch(body));
  });

  v1.get("/documents/:id", zValidator("param", DocumentIdParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    const result = await serviceFor(c).getDocument(id);
    if ("error" in result) {
      return c.json({ error: result.error }, documentErrorStatus(result.error));
    }
    return c.json(result);
  });

  v1.get(
    "/documents/:id/preview",
    zValidator("param", DocumentIdParamSchema),
    zValidator("query", DocumentPreviewQuerySchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const { page, format } = c.req.valid("query");
      const accept = c.req.header("accept") ?? "";
      const wantsJson =
        format === "json" || (format !== "file" && accept.includes("application/json"));
      if (wantsJson) {
        const descriptor = await serviceFor(c).describeDocumentPreview(id, page);
        if ("error" in descriptor) {
          return c.json({ error: descriptor.error }, documentErrorStatus(descriptor.error));
        }
        return c.json(descriptor);
      }
      const range = c.req.header("range") ?? undefined;
      const preview = await serviceFor(c).readDocumentPreview(id, { page, range });
      if ("error" in preview) {
        return c.json({ error: preview.error }, documentErrorStatus(preview.error));
      }
      const { file } = preview;
      const headers: Record<string, string> = {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${file.filename.replaceAll('"', "")}"`,
        "x-backed-document-page": String(page),
      };
      if (file.contentLength !== undefined) {
        headers["content-length"] = String(file.contentLength);
      }
      if (file.contentRange !== undefined) {
        headers["content-range"] = file.contentRange;
      }
      if (file.acceptRanges !== undefined) {
        headers["accept-ranges"] = file.acceptRanges;
      }
      return new Response(file.data, { status: file.status, headers });
    },
  );

  v1.post("/search/chunks", zValidator("json", ChunkSearchBodySchema), async (c) => {
    const result = await serviceFor(c).chunkSearch(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/profile/entities", zValidator("json", EntityProfileBodySchema), async (c) => {
    const result = await serviceFor(c).entityProfile(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/graph/traverse", zValidator("json", GraphTraverseBodySchema), async (c) => {
    const result = await serviceFor(c).graphTraverse(c.req.valid("json"));
    if ("error" in result) {
      const status = result.error.includes("unavailable") ? 503 : 400;
      return c.json({ error: result.error }, status);
    }
    return c.json(result);
  });

  v1.post("/chat/ask", zValidator("json", SemanticAskBodySchema), async (c) => {
    const service = serviceFor(c) as AnchorService & {
      semanticAsk?: (body: {
        question: string;
        evidence?: boolean;
      }) => Promise<SemanticAskResponse>;
    };
    if (service.semanticAsk === undefined) {
      return c.json(
        { error: "Semantic chat is unavailable: set AI_GATEWAY_API_KEY (Vercel AI Gateway)." },
        503,
      );
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
      title: "Backed Platform API",
      version: "0.1.0",
      description:
        "HTTP API for ontology discovery, governed object queries, document archive search, and semantic chat. " +
        "On the public gateway, prefix every path with `/t/{tenantId}` and authenticate with your platform session cookie; " +
        "the gateway adds upstream credentials. In Try it out, leave bearer empty when using the docs UI on the gateway.",
    },
    tags: [
      { name: "model", description: "Ontology entities, relations, and definitions" },
      { name: "object-query-reader", description: "Curated warehouse object queries" },
      { name: "entity-search", description: "Entity text search across the model" },
      { name: "documents", description: "Document metadata and PDF preview" },
      { name: "chunk-search", description: "Semantic search over document chunks" },
      { name: "entity-profile-reader", description: "Enriched entity profiles" },
      { name: "graph-traverse", description: "Multi-hop graph traversal" },
      { name: "semantic-chat", description: "Natural-language answers over governed data" },
    ],
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
      "/health": {
        get: { operationId: "health", security: [], responses: { "200": { description: "OK" } } },
      },
      "/openapi.json": {
        get: {
          operationId: "openApi",
          security: [],
          responses: { "200": { description: "OpenAPI document" } },
        },
      },
      "/v1/model/entities": {
        get: {
          operationId: "listEntities",
          tags: ["model"],
          responses: { "200": { description: "Entities" } },
        },
      },
      "/v1/model/entities/{id}": {
        get: {
          operationId: "getEntity",
          tags: ["model"],
          responses: { "200": { description: "Entity" }, "404": { description: "Not found" } },
        },
      },
      "/v1/model/relations": {
        get: {
          operationId: "listRelations",
          tags: ["model"],
          responses: { "200": { description: "Relations" } },
        },
      },
      "/v1/model/search": {
        post: {
          operationId: "searchModel",
          tags: ["model"],
          responses: { "200": { description: "Matches" } },
        },
      },
      "/v1/model/definitions": {
        post: {
          operationId: "getDefinition",
          tags: ["model"],
          responses: { "200": { description: "Definition" } },
        },
      },
      "/v1/query/objects": {
        post: {
          operationId: "objectQuery",
          tags: ["object-query-reader"],
          responses: { "200": { description: "Rows or count" } },
        },
      },
      "/v1/search/entities": {
        post: {
          operationId: "entitySearch",
          tags: ["entity-search"],
          responses: { "200": { description: "Matches" } },
        },
      },
      "/v1/documents/{id}": {
        get: {
          operationId: "getDocument",
          tags: ["documents"],
          responses: {
            "200": { description: "Document metadata" },
            "404": { description: "Not found" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/documents/{id}/preview": {
        get: {
          operationId: "getDocumentPreview",
          tags: ["documents"],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "format", in: "query", schema: { enum: ["json", "file"] } },
          ],
          responses: {
            "200": {
              description: "PDF bytes or JSON preview descriptor (Accept: application/json)",
            },
            "404": { description: "Not found" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/search/chunks": {
        post: {
          operationId: "chunkSearch",
          tags: ["chunk-search"],
          responses: {
            "200": { description: "Matching chunks" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/profile/entities": {
        post: {
          operationId: "entityProfile",
          tags: ["entity-profile-reader"],
          responses: { "200": { description: "Profile" }, "503": { description: "Unavailable" } },
        },
      },
      "/v1/graph/traverse": {
        post: {
          operationId: "graphTraverse",
          tags: ["graph-traverse"],
          responses: {
            "200": { description: "Joined rows" },
            "503": { description: "Unavailable" },
          },
        },
      },
      "/v1/chat/ask": {
        post: {
          operationId: "semanticAsk",
          tags: ["semantic-chat"],
          responses: {
            "200": {
              description:
                "NL answer with route (single|template), execution steps, SQL, rows/count, and provenance",
            },
            "503": { description: "Unavailable" },
          },
        },
      },
    },
  };
}
