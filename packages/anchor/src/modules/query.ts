import type { ObjectQueryBody, ObjectQueryResponse } from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createQueryModule(transport: Transport, ctx: TenantApiContext) {
  return {
    objects: (body: ObjectQueryBody) =>
      transport.requestJson<ObjectQueryResponse>("POST", ctx.url("/v1/query/objects"), {
        body,
        headers: ctx.headers,
      }),
  };
}
