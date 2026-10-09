import {
  loadFoundryWarehouseDiscoveryProfile,
  persistFoundryWarehouseDiscoveryProfileSnapshot,
  resolveFoundryWarehouseDiscoveryProfile,
} from "@trybacked/infrastructure";
import { createRegistrySourceFromEnv } from "@trybacked/core";
import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { V1_PATH_PREFIX } from "../platform-api-route-meta.js";
import type { PlatformHandlerContext } from "../platform-api-types.js";

async function tenantCatalog(c: PlatformHandlerContext): Promise<string | null> {
  const tenantId = c.get("tenantId");
  const source = createRegistrySourceFromEnv(process.env);
  const snapshot = await source.load();
  const entry = snapshot.registry.tenants[tenantId];
  if (entry === undefined) {
    return null;
  }
  return entry.catalog;
}

export const platformApiDiscoveryProfileRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "getWarehouseDiscoveryProfile",
      method: "get",
      path: `${V1_PATH_PREFIX}/discovery/warehouse-profile`,
      summary: "Profile Foundry warehouse tables for ontology discovery (post-extraction)",
      tags: ["discovery"],
      responses: {
        "200": { description: "Warehouse profile and row samples" },
        "404": { description: "Tenant not in registry or warehouse empty" },
      },
    },
    () => async (c) => {
      const catalog = await tenantCatalog(c);
      if (catalog === null) {
        return c.json({ error: "Tenant not in registry" }, 404);
      }
      const tenantId = c.get("tenantId");
      let loaded = await resolveFoundryWarehouseDiscoveryProfile({
        env: process.env,
        tenantId,
        catalog,
      });
      if (loaded === undefined) {
        loaded = await loadFoundryWarehouseDiscoveryProfile({
          env: process.env,
          catalog,
        });
      }
      if (loaded === undefined) {
        return c.json({ error: "warehouse_empty" }, 404);
      }
      void persistFoundryWarehouseDiscoveryProfileSnapshot({
        env: process.env,
        tenantId,
        catalog,
      }).catch(() => undefined);
      return c.json(loaded);
    },
  ),
];
