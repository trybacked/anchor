import type { AnchorService } from "@trybacked/service";
import type { Context } from "hono";
import type { TenantRuntimeRegistry } from "./tenant-runtime-registry.js";

export type AnchorApiVariables = {
  anchorService: AnchorService;
};

export type PlatformHandlerContext = Context<{ Variables: AnchorApiVariables }>;

export type PlatformHandlerDeps = {
  getService: () => AnchorService;
  platformRegistry: TenantRuntimeRegistry | undefined;
  serveOpenApiDocument: () => Record<string, unknown>;
};
