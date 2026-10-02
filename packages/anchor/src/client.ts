import type { AnchorApiError } from "@trybacked/service";
import { createAiModule } from "./modules/ai.js";
import {
  createAuthModule,
  createHealthModule,
  type AuthModule,
  type HealthModule,
} from "./modules/auth.js";
import { createDocumentsModule } from "./modules/documents.js";
import { createAuthoringDatasetsModule } from "./modules/authoring-datasets.js";
import { createAuthoringJobsModule } from "./modules/authoring-jobs.js";
import { createAuthoringMembersModule } from "./modules/authoring-members.js";
import { createAuthoringOntologyModule } from "./modules/authoring-ontology.js";
import { createAuthoringWarehouseModule } from "./modules/authoring-warehouse.js";
import { createFilesModule } from "./modules/files.js";
import { createGraphModule } from "./modules/graph.js";
import { createModelModule } from "./modules/model.js";
import { createQueryModule } from "./modules/query.js";
import { createSearchModule } from "./modules/search.js";
import { gatewayTenantContext, platformTenantContext } from "./scope.js";
import { createTransport, type TransportOptions } from "./transport.js";

export type TenantClient = {
  tenantId: string;
  model: ReturnType<typeof createModelModule>;
  query: ReturnType<typeof createQueryModule>;
  search: ReturnType<typeof createSearchModule>;
  documents: ReturnType<typeof createDocumentsModule>;
  graph: ReturnType<typeof createGraphModule>;
  ai: ReturnType<typeof createAiModule>;
  files: ReturnType<typeof createFilesModule>;
  authoring: {
    ontology: ReturnType<typeof createAuthoringOntologyModule>;
    warehouse: ReturnType<typeof createAuthoringWarehouseModule>;
    datasets: ReturnType<typeof createAuthoringDatasetsModule>;
    members: ReturnType<typeof createAuthoringMembersModule>;
    jobs: ReturnType<typeof createAuthoringJobsModule>;
  };
};

export type GatewayBackedClientOptions = TransportOptions & {
  mode: "gateway";
  baseUrl: string;
};

export type PlatformBackedClientOptions = TransportOptions & {
  mode: "platform";
  baseUrl: string;
  token: string;
};

export type BackedClientOptions = GatewayBackedClientOptions | PlatformBackedClientOptions;

export type GatewayBackedClient = {
  mode: "gateway";
  auth: AuthModule;
  health: HealthModule;
  tenant: (tenantId: string) => TenantClient;
};

export type PlatformBackedClient = {
  mode: "platform";
  tenant: (tenantId: string) => TenantClient;
};

export type BackedClient = GatewayBackedClient | PlatformBackedClient;

function createTenantClient(
  transport: ReturnType<typeof createTransport>,
  ctx: ReturnType<typeof gatewayTenantContext>,
): TenantClient {
  return {
    tenantId: ctx.tenantId,
    model: createModelModule(transport, ctx),
    query: createQueryModule(transport, ctx),
    search: createSearchModule(transport, ctx),
    documents: createDocumentsModule(transport, ctx),
    graph: createGraphModule(transport, ctx),
    ai: createAiModule(transport, ctx),
    files: createFilesModule(transport, ctx),
    authoring: {
      ontology: createAuthoringOntologyModule(transport, ctx),
      warehouse: createAuthoringWarehouseModule(transport, ctx),
      datasets: createAuthoringDatasetsModule(transport, ctx),
      members: createAuthoringMembersModule(transport, ctx),
      jobs: createAuthoringJobsModule(transport, ctx),
    },
  };
}

export function createBackedClient(options: GatewayBackedClientOptions): GatewayBackedClient;
export function createBackedClient(options: PlatformBackedClientOptions): PlatformBackedClient;
export function createBackedClient(options: BackedClientOptions): BackedClient {
  const transport = createTransport(options.baseUrl, options);

  switch (options.mode) {
    case "gateway": {
      return {
        mode: "gateway",
        auth: createAuthModule(transport),
        health: createHealthModule(transport),
        tenant: (tenantId) =>
          createTenantClient(transport, gatewayTenantContext(options.baseUrl, tenantId)),
      };
    }
    case "platform": {
      return {
        mode: "platform",
        tenant: (tenantId) =>
          createTenantClient(
            transport,
            platformTenantContext(options.baseUrl, options.token, tenantId),
          ),
      };
    }
    default: {
      const exhaustive: never = options;
      throw new Error(`Unsupported client mode: ${String(exhaustive)}`);
    }
  }
}

/** Legacy flat client; prefer `createBackedClient`. */
export function createAnchorClient(options: {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
  onUnauthorized?: (error: AnchorApiError) => void;
}) {
  const base = options.baseUrl.replace(/\/$/, "");
  const tenantMatch = /\/t\/([^/]+)\/?$/.exec(base);
  const gatewayOrigin = tenantMatch !== null ? base.slice(0, tenantMatch.index) : base;
  const tenantId = tenantMatch?.[1];
  const client = createBackedClient({
    mode: "gateway",
    baseUrl: gatewayOrigin.length > 0 ? gatewayOrigin : base,
    ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
    ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
    ...(options.onUnauthorized !== undefined ? { onUnauthorized: options.onUnauthorized } : {}),
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
  });
  const resolvedTenant = tenantId ?? "default";
  const tenant = client.tenant(resolvedTenant);
  return {
    health: () => client.health.status(),
    listEntities: () => tenant.model.listEntities(),
    getEntity: (id: string) => tenant.model.getEntity(id),
    listRelations: (entityId?: string) => tenant.model.listRelations(entityId),
    searchModel: (query: string) => tenant.model.search(query),
    getDefinition: (term: string) => tenant.model.getDefinition(term),
    objectQuery: (body: Parameters<typeof tenant.query.objects>[0]) => tenant.query.objects(body),
    entitySearch: (body: Parameters<typeof tenant.search.entities>[0]) =>
      tenant.search.entities(body),
    chunkSearch: (body: Parameters<typeof tenant.search.chunks>[0]) => tenant.search.chunks(body),
    getDocument: (id: string) => tenant.documents.get(id),
    describeDocumentPreview: (id: string, page?: number) => tenant.documents.preview(id, page),
    entityProfile: (body: Parameters<typeof tenant.graph.profile>[0]) => tenant.graph.profile(body),
    graphTraverse: (body: Parameters<typeof tenant.graph.traverse>[0]) =>
      tenant.graph.traverse(body),
    ask: (body: Parameters<typeof tenant.ai.ask>[0]) => tenant.ai.ask(body),
  };
}

export type AnchorClient = ReturnType<typeof createAnchorClient>;

export { AnchorApiError } from "@trybacked/service";
