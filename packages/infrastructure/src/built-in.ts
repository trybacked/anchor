import type { InfrastructureAdapter } from "./infrastructure.js";
import { registerAdapter } from "./infrastructure.js";
import { sparkDialect } from "@trybacked/compiler";
import {
  createDatabricksBlobStore,
  createDatabricksDatasetProvider,
  createDatabricksJobsClient,
  createDatabricksOntologyRegistry,
  createDatabricksSqlClient,
  DatabricksProviderConfigSchema,
  type DatabricksJobsClient,
  type DatabricksJobRunState,
  type DatabricksSqlClient,
  type SqlParameter,
} from "@trybacked/adapter-databricks";
import {
  createPostgresOntologyRegistry,
  createPostgresWarehouseConnector,
} from "@trybacked/adapter-postgres";
import type { OntologyStore } from "@trybacked/registry";
import type { Pool, PoolConfig } from "pg";
import { Pool as PgPool } from "pg";
import type {
  JobRunner,
  OntologyRegistryPort,
  RegistryLocation,
  SqlParameterValue,
  WarehouseConnector,
} from "@trybacked/ports";

/**
 * Built-in adapter registrations (Plan Phase 3c).
 *
 * Importing this module registers the shipping engines. Applications that want
 * a different engine register their own `InfrastructureAdapter` instead.
 */

function asRecord(config: unknown): Record<string, unknown> {
  return (config ?? {}) as Record<string, unknown>;
}

function connectionStringOf(config: Record<string, unknown>): string | undefined {
  const candidate = config.dsn ?? config.connectionString;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function poolFrom(config: Record<string, unknown>): Pool {
  const dsn = connectionStringOf(config);
  return new PgPool(
    dsn !== undefined ? { connectionString: dsn } : (config as unknown as PoolConfig),
  );
}

/** Translate the port's free-form parameters into the Databricks named-parameter shape. */
function toDatabricksParameters(
  parameters: Record<string, SqlParameterValue> | SqlParameterValue[] | undefined,
): SqlParameter[] | undefined {
  if (parameters === undefined) {
    return undefined;
  }
  const entries: Array<{ name: string; value: SqlParameterValue }> = Array.isArray(parameters)
    ? parameters.map((value, index) => ({ name: `p${String(index)}`, value }))
    : Object.entries(parameters).map(([name, value]) => ({ name, value }));
  // Databricks named statement parameters only accept primitives; nulls are
  // expressed in the SQL itself, never as parameter values.
  return entries.filter(
    (entry): entry is { name: string; value: SqlParameter["value"] } =>
      typeof entry.value !== "object" && entry.value !== null,
  ) as SqlParameter[];
}

function asSqlExecutor(client: DatabricksSqlClient) {
  return {
    execute: async (
      sql: string,
      parameters?: Record<string, SqlParameterValue> | SqlParameterValue[],
    ) => client.execute(sql, toDatabricksParameters(parameters)),
  };
}

function asWarehouseConnector(client: DatabricksSqlClient): WarehouseConnector {
  return {
    provider: createDatabricksDatasetProvider({
      config: DatabricksProviderConfigSchema.parse({}),
      client,
    }),
    executor: asSqlExecutor(client),
    dialect: sparkDialect,
  };
}

/** Adapt the volume-backed OntologyStore to the engine-agnostic registry port. */
function asRegistryPort(store: OntologyStore): OntologyRegistryPort {
  return {
    loadCurrent: async (location: RegistryLocation) => store.loadCurrent(location.container),
    publish: async (location: RegistryLocation, record, modelYaml) =>
      store.publish(location.container, record, modelYaml),
  };
}

function mapDatabricksRunState(
  state: DatabricksJobRunState,
): "pending" | "running" | "completed" | "failed" {
  switch (state) {
    case "PENDING":
    case "BLOCKED":
    case "WAITING_FOR_RETRY":
      return "pending";
    case "RUNNING":
    case "TERMINATING":
    case "QUEUED":
      return "running";
    case "TERMINATED":
      return "completed";
    case "SKIPPED":
    case "INTERNAL_ERROR":
      return "failed";
    default: {
      const exhaustive: never = state;
      throw new Error(`Unknown Databricks run state: ${String(exhaustive)}`);
    }
  }
}

function asJobRunner(client: DatabricksJobsClient): JobRunner {
  return {
    findJobByName: async (name) => {
      const id = await client.findJobIdByName(name);
      return id === null ? null : { jobId: String(id) };
    },
    runNow: async (jobId) => {
      const run = await client.runNow(Number(jobId));
      return { runId: String(run.runId) };
    },
    getRunStatus: async (runId) => {
      const run = await client.getRun(Number(runId));
      return mapDatabricksRunState(run.state);
    },
  };
}

const databricksAdapter: InfrastructureAdapter = {
  engine: "databricks",
  createWarehouse: async (config) => {
    const parsed = DatabricksProviderConfigSchema.parse(config);
    return asWarehouseConnector(createDatabricksSqlClient(parsed));
  },
  createObjectStorage: async (config) =>
    createDatabricksBlobStore(DatabricksProviderConfigSchema.parse(config)),
  createRegistry: async (config) =>
    asRegistryPort(createDatabricksOntologyRegistry(DatabricksProviderConfigSchema.parse(config))),
  createJobRunner: async (config) =>
    asJobRunner(createDatabricksJobsClient(DatabricksProviderConfigSchema.parse(config))),
  defaultRegistryContainer: (config) => {
    const catalog = asRecord(config).catalog;
    return typeof catalog === "string" && catalog.length > 0 ? catalog : "backed";
  },
};

const postgresAdapter: InfrastructureAdapter = {
  engine: "postgres",
  createWarehouse: async (config) =>
    createPostgresWarehouseConnector(poolFrom(asRecord(config)), {
      schemas: Array.isArray(config.schemas) ? config.schemas.map(String) : undefined,
    }),
  createRegistry: async (config) => createPostgresOntologyRegistry(poolFrom(asRecord(config))),
  defaultRegistryContainer: (config) => {
    const schema = asRecord(config).schema;
    return typeof schema === "string" && schema.length > 0 ? schema : "public";
  },
};

let registered = false;

/** Register built-in adapters once per process. */
export function registerBuiltInAdapters(): void {
  if (registered) {
    return;
  }
  registerAdapter(databricksAdapter);
  registerAdapter(postgresAdapter);
  registered = true;
}