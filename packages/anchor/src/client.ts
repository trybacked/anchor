import type { ObjectQueryBody } from "@trybacked/service";
import type {
  ChunkSearchResponse,
  EntityProfileResponse,
  EntitySearchResponse,
  GetEntityResponse,
  GraphTraverseResponse,
  HealthResponse,
  ListEntitiesResponse,
  ListRelationsResponse,
  ObjectQueryResponse,
  SearchMatch,
} from "@trybacked/service";
import { AnchorApiError } from "@trybacked/service";

export type AnchorClientOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
};

async function requestJson<T>(
  options: AnchorClientOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const fetchFn = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };
  const response = await fetchFn(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `HTTP ${String(response.status)}`;
    throw new AnchorApiError(response.status, message);
  }
  return payload as T;
}

/** Thin HTTP client aligned with apps/api-server OpenAPI operationIds. */
export function createAnchorClient(options: AnchorClientOptions) {
  return {
    health: () => requestJson<HealthResponse>(options, "GET", "/health"),

    listEntities: () => requestJson<ListEntitiesResponse>(options, "GET", "/v1/model/entities"),

    getEntity: (id: string) =>
      requestJson<GetEntityResponse>(options, "GET", `/v1/model/entities/${encodeURIComponent(id)}`),

    listRelations: (entityId?: string) => {
      const query = entityId !== undefined ? `?entityId=${encodeURIComponent(entityId)}` : "";
      return requestJson<ListRelationsResponse>(options, "GET", `/v1/model/relations${query}`);
    },

    searchModel: (query: string) =>
      requestJson<SearchMatch[]>(options, "POST", "/v1/model/search", { query }),

    getDefinition: (term: string) =>
      requestJson<unknown>(options, "POST", "/v1/model/definitions", { term }),

    objectQuery: (body: ObjectQueryBody) =>
      requestJson<ObjectQueryResponse>(options, "POST", "/v1/query/objects", body),

    entitySearch: (body: { query: string; kinds?: ("entity" | "property" | "relation" | "rule")[] }) =>
      requestJson<EntitySearchResponse>(options, "POST", "/v1/search/entities", body),

    chunkSearch: (body: {
      query: string;
      limit?: number;
      minScore?: number;
      documentIds?: string[];
    }) => requestJson<ChunkSearchResponse>(options, "POST", "/v1/search/chunks", body),

    entityProfile: (body: {
      name: string;
      matchLimit?: number;
      factLimit?: number;
      documentLimit?: number;
    }) => requestJson<EntityProfileResponse>(options, "POST", "/v1/profile/entities", body),

    graphTraverse: (body: {
      relationId: string;
      value: string | number;
      direction?: "forward" | "reverse";
      depth?: number;
      limit: number;
      mode?: "rows" | "count";
    }) => requestJson<GraphTraverseResponse>(options, "POST", "/v1/graph/traverse", body),

    ask: (body: { question: string; evidence?: boolean }) =>
      requestJson<{ text: string } & Record<string, unknown>>(options, "POST", "/v1/chat/ask", body),
  };
}

export type AnchorClient = ReturnType<typeof createAnchorClient>;
