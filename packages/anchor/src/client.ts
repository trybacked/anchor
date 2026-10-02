import {
  AnchorApiError,
  type ChunkSearchBody,
  type EntityProfileBody,
  type EntitySearchBody,
  type GetDefinitionResponse,
  type GraphTraverseBody,
  type ObjectQueryBody,
  type ChunkSearchResponse,
  type DocumentPreviewResponse,
  type EntityProfileResponse,
  type EntitySearchResponse,
  type GetDocumentResponse,
  type GetEntityResponse,
  type GraphTraverseResponse,
  type HealthResponse,
  type ListEntitiesResponse,
  type ListRelationsResponse,
  type ObjectQueryResponse,
  type SearchMatch,
  type SemanticAskResponse,
} from "@trybacked/service";

export type AnchorClientOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;

  credentials?: "omit" | "same-origin" | "include";

  onUnauthorized?: (error: AnchorApiError) => void;
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
  const init: RequestInit = {
    method,
    headers,
    ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const response = await fetchFn(`${options.baseUrl.replace(/\/$/, "")}${path}`, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `HTTP ${String(response.status)}`;
    const error = new AnchorApiError(response.status, message);
    if (
      (response.status === 401 || response.status === 403) &&
      options.onUnauthorized !== undefined
    ) {
      options.onUnauthorized(error);
    }
    throw error;
  }
  return payload as T;
}

export function createAnchorClient(options: AnchorClientOptions) {
  return {
    health: () => requestJson<HealthResponse>(options, "GET", "/health"),

    listEntities: () => requestJson<ListEntitiesResponse>(options, "GET", "/v1/model/entities"),

    getEntity: (id: string) =>
      requestJson<GetEntityResponse>(
        options,
        "GET",
        `/v1/model/entities/${encodeURIComponent(id)}`,
      ),

    listRelations: (entityId?: string) => {
      const query = entityId !== undefined ? `?entityId=${encodeURIComponent(entityId)}` : "";
      return requestJson<ListRelationsResponse>(options, "GET", `/v1/model/relations${query}`);
    },

    searchModel: (query: string) =>
      requestJson<SearchMatch[]>(options, "POST", "/v1/model/search", { query }),

    getDefinition: (term: string) =>
      requestJson<GetDefinitionResponse>(options, "POST", "/v1/model/definitions", { term }),

    objectQuery: (body: ObjectQueryBody) =>
      requestJson<ObjectQueryResponse>(options, "POST", "/v1/query/objects", body),

    entitySearch: (body: EntitySearchBody) =>
      requestJson<EntitySearchResponse>(options, "POST", "/v1/search/entities", body),

    chunkSearch: (body: ChunkSearchBody) =>
      requestJson<ChunkSearchResponse>(options, "POST", "/v1/search/chunks", body),

    getDocument: (documentId: string) =>
      requestJson<GetDocumentResponse>(
        options,
        "GET",
        `/v1/documents/${encodeURIComponent(documentId)}`,
      ),

    describeDocumentPreview: (documentId: string, page = 1) =>
      requestJson<DocumentPreviewResponse>(
        options,
        "GET",
        `/v1/documents/${encodeURIComponent(documentId)}/preview?page=${String(page)}&format=json`,
      ),

    entityProfile: (body: EntityProfileBody) =>
      requestJson<EntityProfileResponse>(options, "POST", "/v1/profile/entities", body),

    graphTraverse: (body: GraphTraverseBody) =>
      requestJson<GraphTraverseResponse>(options, "POST", "/v1/graph/traverse", body),

    ask: (body: { question: string; evidence?: boolean }) =>
      requestJson<SemanticAskResponse>(options, "POST", "/v1/chat/ask", body),
  };
}

export type AnchorClient = ReturnType<typeof createAnchorClient>;

export { AnchorApiError };
