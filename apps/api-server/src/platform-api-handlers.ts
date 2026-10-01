import {
  ChunkSearchBodySchema,
  EntityProfileBodySchema,
  EntitySearchBodySchema,
  GetDefinitionBodySchema,
  GraphTraverseBodySchema,
  ObjectQueryBodySchema,
  SearchModelBodySchema,
  SemanticAskBodySchema,
  type AnchorService,
  type SemanticAskResponse,
} from "@trybacked/service";
import type { Context } from "hono";
import { buildOpenApiDocument } from "./openapi-document.js";
import type { PlatformOperationId } from "./platform-api-catalog.js";
import {
  DocumentIdParamSchema,
  DocumentPreviewQuerySchema,
  EntityIdParamSchema,
  ListRelationsQuerySchema,
} from "./platform-api-schemas.js";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";

export type AnchorApiVariables = {
  anchorService: AnchorService;
};

export type PlatformHandlerContext = Context<{ Variables: AnchorApiVariables }>;

export type PlatformHandlerDeps = {
  getService: () => AnchorService;
  platformRegistry: TenantRuntimeRegistry | undefined;
  openApiSecured: boolean;
};

function documentErrorStatus(message: string): 400 | 404 | 503 {
  if (message.includes("not found")) {
    return 404;
  }
  if (message.includes("unavailable")) {
    return 503;
  }
  return 400;
}

export function createPlatformHandlers(
  deps: PlatformHandlerDeps,
): Record<PlatformOperationId, (c: PlatformHandlerContext) => Response | Promise<Response>> {
  const serviceFor = (c: PlatformHandlerContext) => c.get("anchorService");

  return {
    healthLive: (c) => c.json({ ok: true as const }),

    health: async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
          cachedTenants: deps.platformRegistry.cachedTenantIds(),
        });
      }
      const service = deps.getService();
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: service.capabilities(),
      });
    },

    healthReady: async (c) => {
      if (deps.platformRegistry !== undefined) {
        return c.json({
          ok: true as const,
          mode: "platform" as const,
          tenants: await deps.platformRegistry.listTenantIds(),
        });
      }
      const service = deps.getService();
      return c.json({
        ok: true as const,
        mode: "workspace" as const,
        capabilities: service.capabilities(),
      });
    },

    openApi: (c) => c.json(buildOpenApiDocument(deps.openApiSecured)),

    listEntities: (c) => c.json(serviceFor(c).listEntities()),

    getEntity: (c) => {
      const { id } = EntityIdParamSchema.parse(c.req.param());
      const result = serviceFor(c).getEntity(id);
      if ("error" in result) {
        return c.json({ error: result.error }, 404);
      }
      return c.json(result);
    },

    listRelations: (c) => {
      const { entityId } = ListRelationsQuerySchema.parse(c.req.query());
      return c.json(serviceFor(c).listRelations(entityId));
    },

    searchModel: async (c) => {
      const { query } = SearchModelBodySchema.parse(await c.req.json());
      return c.json(await serviceFor(c).searchModel(query));
    },

    getDefinition: async (c) => {
      const { term } = GetDefinitionBodySchema.parse(await c.req.json());
      return c.json(serviceFor(c).getDefinition(term));
    },

    objectQuery: async (c) => {
      const body = ObjectQueryBodySchema.parse(await c.req.json());
      const result = await serviceFor(c).objectQuery(body);
      if ("error" in result) {
        const status = result.error.includes("unavailable") ? 503 : 400;
        return c.json({ error: result.error }, status);
      }
      return c.json(result);
    },

    entitySearch: async (c) => {
      const body = EntitySearchBodySchema.parse(await c.req.json());
      return c.json(await serviceFor(c).entitySearch(body));
    },

    getDocument: async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const result = await serviceFor(c).getDocument(id);
      if ("error" in result) {
        return c.json({ error: result.error }, documentErrorStatus(result.error));
      }
      return c.json(result);
    },

    getDocumentPreview: async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const { page, format } = DocumentPreviewQuerySchema.parse(c.req.query());
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

    chunkSearch: async (c) => {
      const result = await serviceFor(c).chunkSearch(
        ChunkSearchBodySchema.parse(await c.req.json()),
      );
      if ("error" in result) {
        const status = result.error.includes("unavailable") ? 503 : 400;
        return c.json({ error: result.error }, status);
      }
      return c.json(result);
    },

    entityProfile: async (c) => {
      const result = await serviceFor(c).entityProfile(
        EntityProfileBodySchema.parse(await c.req.json()),
      );
      if ("error" in result) {
        const status = result.error.includes("unavailable") ? 503 : 400;
        return c.json({ error: result.error }, status);
      }
      return c.json(result);
    },

    graphTraverse: async (c) => {
      const result = await serviceFor(c).graphTraverse(
        GraphTraverseBodySchema.parse(await c.req.json()),
      );
      if ("error" in result) {
        const status = result.error.includes("unavailable") ? 503 : 400;
        return c.json({ error: result.error }, status);
      }
      return c.json(result);
    },

    semanticAsk: async (c) => {
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
      const body = SemanticAskBodySchema.parse(await c.req.json());
      const answer = await service.semanticAsk({
        question: body.question,
        ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
      });
      return c.json(answer);
    },
  };
}
