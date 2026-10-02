import type {
  GetDefinitionResponse,
  GetEntityResponse,
  ListEntitiesResponse,
  ListRelationsResponse,
  SearchMatch,
} from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createModelModule(transport: Transport, ctx: TenantApiContext) {
  const headers = () => ctx.headers;
  return {
    listEntities: () =>
      transport.requestJson<ListEntitiesResponse>("GET", ctx.url("/v1/model/entities"), {
        headers: headers(),
      }),

    getEntity: (id: string) =>
      transport.requestJson<GetEntityResponse>(
        "GET",
        ctx.url(`/v1/model/entities/${encodeURIComponent(id)}`),
        { headers: headers() },
      ),

    listRelations: (entityId?: string) => {
      const query = entityId !== undefined ? `?entityId=${encodeURIComponent(entityId)}` : "";
      return transport.requestJson<ListRelationsResponse>(
        "GET",
        ctx.url(`/v1/model/relations${query}`),
        { headers: headers() },
      );
    },

    search: (query: string) =>
      transport.requestJson<SearchMatch[]>("POST", ctx.url("/v1/model/search"), {
        body: { query },
        headers: headers(),
      }),

    getDefinition: (term: string) =>
      transport.requestJson<GetDefinitionResponse>("POST", ctx.url("/v1/model/definitions"), {
        body: { term },
        headers: headers(),
      }),
  };
}
