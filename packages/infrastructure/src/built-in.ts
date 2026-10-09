import type { OntologyRegistryPort } from "@trybacked/ports";
import type { OntologyStore } from "@trybacked/registry";
import {
  createFilesystemOntologyStore,
  createFilesWarehouseConnector,
} from "./adapters/files/index.js";
import type { InfrastructureAdapter } from "./infrastructure.js";
import { registerAdapter } from "./infrastructure.js";

function asRegistryPort(store: OntologyStore): OntologyRegistryPort {
  return {
    loadCurrent: async (location) => store.loadCurrent(location.container),
    publish: async (location, record, modelYaml) =>
      store.publish(location.container, record, modelYaml),
  };
}

function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

const filesAdapter: InfrastructureAdapter = {
  engine: "files",
  createWarehouse: (config) =>
    Promise.resolve(
      createFilesWarehouseConnector({
        root: configString(config, "root"),
      }),
    ),
  createRegistry: (config) =>
    Promise.resolve(
      asRegistryPort(
        createFilesystemOntologyStore({
          registryBasePath: configString(config, "registryBasePath"),
        }),
      ),
    ),
  defaultRegistryContainer: () => "local",
};

let registered = false;

export function registerBuiltInAdapters(): void {
  if (registered) {
    return;
  }
  registerAdapter(filesAdapter);
  registered = true;
}
