import {
  isServiceErrorResult,
  type AnchorService,
  type ServiceErrorResult,
} from "@trybacked/service";
import type { z } from "zod";
import { jsonServiceErrorResponse, readJsonBody } from "./platform-api-handler-utils.js";
import type { JsonBodySpec, PlatformApiRouteSpec } from "./platform-api-route-meta.js";
import type {
  PlatformHandlerContext,
  PlatformHandlerDeps,
  PlatformRouteHandler,
} from "./platform-api-types.js";

export type RouteFactory = {
  meta: PlatformApiRouteSpec;
  createHandler: (deps: PlatformHandlerDeps) => PlatformRouteHandler;
};

export function platformRoute(
  meta: PlatformApiRouteSpec,
  createHandler: (deps: PlatformHandlerDeps) => PlatformRouteHandler,
): RouteFactory {
  return { meta, createHandler };
}

type PostJsonMeta<Schema extends z.ZodTypeAny> = Omit<
  PlatformApiRouteSpec,
  "method" | "jsonBody"
> & {
  jsonBody: JsonBodySpec<string, Schema>;
};

export function postJsonRoute<Schema extends z.ZodTypeAny>(
  meta: PostJsonMeta<Schema>,
  handle: (c: PlatformHandlerContext, body: z.output<Schema>) => Response | Promise<Response>,
): RouteFactory {
  const { schema } = meta.jsonBody;
  return platformRoute(
    { ...meta, method: "post" },
    () => async (c) => handle(c, await readJsonBody(c, schema)),
  );
}

export function postServiceJsonRoute<Schema extends z.ZodTypeAny>(
  meta: PostJsonMeta<Schema>,
  invoke: (
    service: AnchorService,
    body: z.output<Schema>,
  ) => Promise<Record<string, unknown> | ServiceErrorResult>,
): RouteFactory {
  return postJsonRoute(meta, async (c, body) => {
    const result = await invoke(c.get("anchorService"), body);
    if (isServiceErrorResult(result)) {
      return jsonServiceErrorResponse(c, result);
    }
    return c.json(result);
  });
}
