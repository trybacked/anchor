import type { AnchorService, DocumentFilesService } from "@trybacked/service";
import type { Context } from "hono";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";
export type AnchorApiVariables = {
  tenantId: string;
  anchorService?: AnchorService | undefined;
  documentFilesService?: DocumentFilesService | undefined;
};
export type PlatformHandlerContext = Context<{
  Variables: AnchorApiVariables;
}>;
export type PlatformHandlerDeps = {
  getService: () => AnchorService;
  platformRegistry: TenantRuntimeRegistry | undefined;
  serveOpenApiDocument: () => Record<string, unknown>;
  resolveOntologyService: (tenantId: string) => Promise<AnchorService>;
  resolveFilesService: (tenantId: string) => Promise<DocumentFilesService>;
};
export type PlatformRouteHandler = (c: PlatformHandlerContext) => Response | Promise<Response>;
