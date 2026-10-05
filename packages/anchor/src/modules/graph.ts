import type {
  EntityProfileBody,
  EntityProfileResponse,
  GraphTraverseBody,
  GraphTraverseResponse,
} from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";
export function createGraphModule(transport: Transport, ctx: TenantApiContext) {
  return {
    profile: (body: EntityProfileBody) =>
      transport.requestJson<EntityProfileResponse>("POST", ctx.url("/v1/profile/entities"), {
        body,
        headers: ctx.headers,
      }),
    traverse: (body: GraphTraverseBody) =>
      transport.requestJson<GraphTraverseResponse>("POST", ctx.url("/v1/graph/traverse"), {
        body,
        headers: ctx.headers,
      }),
  };
}
