import {
  createTenantInfrastructure,
  registerAdapter,
  resetAdapters,
  type InfrastructureAdapter,
  type WarehouseConnector,
} from "../../src/infrastructure.js";
import type { DatasetProvider } from "@trybacked/core";
import { describe, expect, it, beforeEach } from "vitest";

/** Minimal in-memory adapter used to prove the composition root is engine-agnostic. */
function createFakeWarehouse(): WarehouseConnector {
  const provider: DatasetProvider = {
    listDatasets: async () => [{ id: "main.things", name: "things" }],
    getSchema: async () => ({
      columns: [{ name: "id", type: "string", nullable: false }],
    }),
    getMetadata: async () => ({ rowCount: 1 }),
    getStatistics: async () => ({ columns: [{ name: "id", distinctCount: 1 }] }),
  };
  return {
    provider,
    executor: {
      execute: async (sql) => [{ sql }],
    },
    dialect: {
      paramStyle: "named",
      param: (index) => `:p${String(index)}`,
      quoteIdent: (id) => `<${id}>`,
      qualify: (id) => `<${id}>`,
      ciContains: (col, name) => `${col} CI :${name}`,
      regexMatch: () => null,
      arrayContains: (col, name) => `${col} ANY :${name}`,
      limitOffset: (limit) => ` TAKE ${String(limit)}`,
    },
  };
}

function registerFakeAdapter(engine: string): void {
  registerAdapter({
    engine,
    createWarehouse: async () => createFakeWarehouse(),
    createRegistry: async () => ({
      loadCurrent: async () => null,
      publish: async () => undefined,
    }),
  });
}

describe("createTenantInfrastructure", () => {
  beforeEach(() => {
    resetAdapters();
    registerFakeAdapter("fake-engine");
    registerFakeAdapter("other-engine");
  });

  it("composes infrastructure from the preferred connection", async () => {
    const infra = await createTenantInfrastructure({
      connections: [
        { connectionId: "main", engine: "fake-engine", config: {} },
        { connectionId: "alt", engine: "other-engine", config: {} },
      ],
      warehouseConnectionId: "alt",
      registryContainer: "tenant_one",
    });
    expect(infra.warehouse).toBeDefined();
    expect(infra.registryLocation.container).toBe("tenant_one");
    const rows = await infra.warehouse.executor.execute("SELECT 1");
    expect(rows[0]).toEqual({ sql: "SELECT 1" });
  });

  it("throws a clear error for an unknown engine", async () => {
    await expect(
      createTenantInfrastructure({
        connections: [{ connectionId: "x", engine: "nope", config: {} }],
      }),
    ).rejects.toThrow(/No infrastructure adapter registered for engine "nope"/);
  });

  it("falls back to the adapter default registry container", async () => {
    registerAdapter({
      engine: "with-default",
      createWarehouse: async () => createFakeWarehouse(),
      createRegistry: async () => ({
        loadCurrent: async () => null,
        publish: async () => undefined,
      }),
      defaultRegistryContainer: () => "default-container",
    });
    const infra = await createTenantInfrastructure({
      connections: [{ connectionId: "d", engine: "with-default", config: {} }],
    });
    expect(infra.registryLocation.container).toBe("default-container");
  });
});