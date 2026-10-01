import {
  isServiceErrorResult,
  type AnchorService,
  type ServiceErrorResult,
} from "@trybacked/service";
import type { z } from "zod";
import { jsonServiceErrorResponse, readJsonBody } from "./platform-api-handler-utils.js";
import type { JsonBodySpec, PlatformApiRouteSpec } from "./platform-api-route-meta.js";
import type { PlatformHandlerContext, PlatformHandlerDeps } from "./platform-api-types.js";

type RouteHandler = (c: PlatformHandlerContext) => Response | Promise<Response>;

export type RouteFactory = {
  meta: PlatformApiRouteSpec;
  createHandler: (deps: PlatformHandlerDeps) => RouteHandler;
};

export function platformRoute(
  meta: PlatformApiRouteSpec,
  createHandler: (deps: PlatformHandlerDeps) => RouteHandler,
): RouteFactory {
  return { meta, createHandler };
}

type PostJsonMeta<Schema extends z.ZodTypeAny> = Omit<
  PlatformApiRouteSpec,
  "method" | "jsonBody"
> & {
  jsonBody: JsonBodySpec<string, Schema>;
};

/** POST route: OpenAPI `jsonBody` schema is the same one used to parse the request. */
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

/** POST JSON route with standard `{ error }` → status mapping from the service layer. */
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
