import type {
  ChunkSearchBody,
  ChunkSearchResponse,
  EntitySearchBody,
  EntitySearchResponse,
} from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createSearchModule(transport: Transport, ctx: TenantApiContext) {
  return {
    entities: (body: EntitySearchBody) =>
      transport.requestJson<EntitySearchResponse>("POST", ctx.url("/v1/search/entities"), {
        body,
        headers: ctx.headers,
      }),

    chunks: (body: ChunkSearchBody) =>
      transport.requestJson<ChunkSearchResponse>("POST", ctx.url("/v1/search/chunks"), {
        body,
        headers: ctx.headers,
      }),
  };
}
