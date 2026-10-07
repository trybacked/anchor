import { createFileRegistrySource, type TenantRegistrySource } from "@trybacked/core";
import { createOntologyStoreFromEnv } from "@trybacked/infrastructure";
import type { OntologyStore } from "@trybacked/registry";
import type { AnchorOperationAuditHook, AnchorService } from "@trybacked/service";
import { createAnchorServiceForModel, modelFromRemoteYaml } from "./service-factory.js";

export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant "${tenantId}" is not in the registry.`);
    this.name = "TenantNotFoundError";
  }
}

export class OntologyNotPublishedError extends Error {
  constructor(tenantId: string, catalog: string) {
    super(`Ontology not published for tenant "${tenantId}" (catalog ${catalog}).`);
    this.name = "OntologyNotPublishedError";
  }
}

type CacheEntry = {
  service: AnchorService;
  loadedAt: number;
  registryVersion: string;
  ontologyVersion: number;
};

export type TenantRuntimeRegistry = {
  listTenantIds: () => Promise<string[]>;
  cachedTenantIds: () => string[];
  resolve: (tenantId: string) => Promise<AnchorService>;
};

export function createTenantRuntimeRegistry(options: {
  registryPath?: string | undefined;
  registrySource?: TenantRegistrySource | undefined;
  env: NodeJS.ProcessEnv;
  ontologyStore?: OntologyStore | undefined;
  cacheTtlSeconds?: number | undefined;
  audit?: {
    onOperation?: AnchorOperationAuditHook;
    auditPrincipal?: string;
  };
}): TenantRuntimeRegistry {
  const ttlMs = (options.cacheTtlSeconds ?? 300) * 1000;
  const source =
    options.registrySource ??
    createFileRegistrySource(options.registryPath ?? "/etc/backed/tenants.yaml");
  const ontologyStore = options.ontologyStore ?? createOntologyStoreFromEnv(options.env);
  const cache = new Map<string, CacheEntry>();

  function tenantOntologyVersion(
    registry: Awaited<ReturnType<typeof loadRegistry>>,
    tenantId: string,
  ): number {
    return registry.tenants[tenantId]?.ontologyVersion ?? 0;
  }

  let lastRegistryVersion = "";

  async function loadRegistry() {
    const snapshot = await source.load();
    if (snapshot.version !== lastRegistryVersion) {
      cache.clear();
      lastRegistryVersion = snapshot.version;
    }
    return snapshot.registry;
  }

  async function listTenantIds(): Promise<string[]> {
    const registry = await loadRegistry();
    return Object.keys(registry.tenants);
  }

  async function build(tenantId: string): Promise<AnchorService> {
    const registry = await loadRegistry();
    const entry = registry.tenants[tenantId];
    if (entry === undefined) {
      throw new TenantNotFoundError(tenantId);
    }
    const remote = await ontologyStore.loadCurrent(entry.catalog);
    if (remote === null) {
      throw new OntologyNotPublishedError(tenantId, entry.catalog);
    }
    const model = modelFromRemoteYaml(remote.modelYaml);
    return createAnchorServiceForModel({
      model,
      ontology: remote.ontology,
      catalog: entry.catalog,
      tenantId,
      env: options.env,
      tenantCapabilities: entry.capabilities,
      audit: {
        ...(options.audit?.onOperation !== undefined
          ? { onOperation: options.audit.onOperation }
          : {}),
        ...(options.audit?.auditPrincipal !== undefined
          ? { auditPrincipal: options.audit.auditPrincipal }
          : {}),
        tenant: tenantId,
      },
    });
  }

  return {
    listTenantIds,
    cachedTenantIds: () => [...cache.keys()],
    resolve: async (tenantId) => {
      const snapshot = await source.load();
      if (snapshot.version !== lastRegistryVersion) {
        cache.clear();
        lastRegistryVersion = snapshot.version;
      }
      const now = Date.now();
      const registry = snapshot.registry;
      const ontologyVersion = tenantOntologyVersion(registry, tenantId);
      const cached = cache.get(tenantId);
      if (
        cached !== undefined &&
        now - cached.loadedAt < ttlMs &&
        cached.registryVersion === snapshot.version &&
        cached.ontologyVersion === ontologyVersion
      ) {
        return cached.service;
      }
      const service = await build(tenantId);
      cache.set(tenantId, {
        service,
        loadedAt: now,
        registryVersion: snapshot.version,
        ontologyVersion,
      });
      return service;
    },
  };
}
