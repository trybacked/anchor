import type {
  JobRunner,
  ObjectStorage,
  OntologyRegistryPort,
  ProvisionerPort,
  RegistryLocation,
  SecretResolver,
  WarehouseConnector,
} from "@trybacked/ports";
import { z } from "zod";

/**
 * Infrastructure composition root (Plan Phase 3c).
 *
 * The ONLY layer allowed to import adapter implementations. Apps compose
 * tenant infrastructure from the TenantProfile through the adapter registry:
 * the same application code runs on the files engine today and future warehouse adapters
 * registers an `InfrastructureAdapter`.
 */

export const ConnectionConfigSchema = z.object({
  connectionId: z.string().min(1),
  engine: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  secretRef: z.string().min(1).optional(),
});
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

export const InfrastructureInputSchema = z.object({
  connections: z.array(ConnectionConfigSchema).min(1),
  /** Preferred warehouse connection; defaults to the first connection. */
  warehouseConnectionId: z.string().min(1).optional(),
  /** Registry container (catalog/database) — resolved from the tenant profile. */
  registryContainer: z.string().min(1).optional(),
});
export type InfrastructureInput = z.infer<typeof InfrastructureInputSchema>;

/** A full adapter bundle for one engine. Every capability is optional except warehouse. */
export type InfrastructureAdapter = {
  engine: string;
  createWarehouse: (config: Record<string, unknown>) => Promise<WarehouseConnector>;
  createObjectStorage?: (config: Record<string, unknown>) => Promise<ObjectStorage>;
  createRegistry: (config: Record<string, unknown>) => Promise<OntologyRegistryPort>;
  createJobRunner?: (config: Record<string, unknown>) => Promise<JobRunner>;
  createProvisioner?: (config: Record<string, unknown>) => Promise<ProvisionerPort>;
  createSecretResolver?: (config: Record<string, unknown>) => Promise<SecretResolver>;
  /** Default registry container for this engine when the profile omits one. */
  defaultRegistryContainer?: (config: Record<string, unknown>) => string;
};

export type TenantInfrastructure = {
  warehouse: WarehouseConnector;
  objectStorage?: ObjectStorage | undefined;
  registry: OntologyRegistryPort;
  registryLocation: RegistryLocation;
  jobRunner?: JobRunner | undefined;
  provisioner?: ProvisionerPort | undefined;
  secretResolver?: SecretResolver | undefined;
};

const registry = new Map<string, InfrastructureAdapter>();

/** Register (or replace) the adapter bundle for an engine. Idempotent. */
export function registerAdapter(adapter: InfrastructureAdapter): void {
  registry.set(adapter.engine, adapter);
}

export function listAdapters(): string[] {
  return [...registry.keys()].sort();
}

export function getAdapter(engine: string): InfrastructureAdapter {
  const adapter = registry.get(engine);
  if (adapter === undefined) {
    throw new Error(
      `No infrastructure adapter registered for engine "${engine}". Registered: ${listAdapters().join(", ")}`,
    );
  }
  return adapter;
}

/** Reset registrations (used by tests). */
export function resetAdapters(): void {
  registry.clear();
}

/** Compose tenant infrastructure from profile data + registered adapters. */
export async function createTenantInfrastructure(
  input: InfrastructureInput,
): Promise<TenantInfrastructure> {
  const parsed = InfrastructureInputSchema.parse(input);
  const preferred =
    parsed.connections.find((c) => c.connectionId === parsed.warehouseConnectionId) ??
    parsed.connections[0];
  if (preferred === undefined) {
    throw new Error("Infrastructure input has no connections");
  }
  const adapter = getAdapter(preferred.engine);
  const config = preferred.config;
  const [warehouse, registryPort, objectStorage, jobRunner, provisioner, secretResolver] =
    await Promise.all([
      adapter.createWarehouse(config),
      adapter.createRegistry(config),
      adapter.createObjectStorage?.(config),
      adapter.createJobRunner?.(config),
      adapter.createProvisioner?.(config),
      adapter.createSecretResolver?.(config),
    ]);
  const container =
    parsed.registryContainer ??
    adapter.defaultRegistryContainer?.(config) ??
    preferred.connectionId;
  return {
    warehouse,
    registry: registryPort,
    registryLocation: { container },
    objectStorage,
    jobRunner,
    provisioner,
    secretResolver,
  };
}
