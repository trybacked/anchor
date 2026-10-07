import type { Ontology } from "@trybacked/core";
import { z } from "zod";

/**
 * Storage, registry, jobs, search, provisioning and secrets ports (Plan Phase 3).
 *
 * These contracts are intentionally vendor-free: adapters map them onto
 * Databricks volumes/jobs/vector search, Postgres/S3, or any future engine.
 */

/** Object storage for arbitrary text blobs (registry artifacts, exports). */
export type ObjectStorage = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string, options?: { overwrite?: boolean }) => Promise<void>;
};

/** Where the ontology registry lives, resolved by the adapter — no hardcoded paths. */
export const RegistryLocationSchema = z.object({
  /** Engine-agnostic container, e.g. a catalog name or database/schema. */
  container: z.string().min(1),
  /** Adapter-specific root path inside the container (e.g. a volume or bucket prefix). */
  rootPath: z.string().min(1).optional(),
});
export type RegistryLocation = z.infer<typeof RegistryLocationSchema>;

export type PublicationRecordLike = {
  version: number;
  publishedAt: string;
  runId: string;
  ontology: Ontology;
};

export type OntologyRegistryPort = {
  loadCurrent: (
    location: RegistryLocation,
  ) => Promise<(PublicationRecordLike & { modelYaml: string }) | null>;
  publish: (
    location: RegistryLocation,
    record: PublicationRecordLike,
    modelYaml: string,
  ) => Promise<void>;
};

/** Async job execution on the warehouse (refresh jobs, long-running SQL). */
export type JobRunner = {
  findJobByName: (name: string) => Promise<{ jobId: string } | null>;
  runNow: (jobId: string) => Promise<{ runId: string }>;
  getRunStatus: (runId: string) => Promise<"pending" | "running" | "completed" | "failed">;
};

/** Text and vector search over stored content (chunks, documents). */
export type SearchIndexPort = {
  /** Semantic (embedding) search; returns scored rows from the given index. */
  semanticSearch: (
    index: { name: string; columns: string[] },
    query: string,
    options: { topK: number; filters?: Record<string, string> },
  ) => Promise<Array<Record<string, unknown> & { score?: number }>>;
  /** Lexical search fallback when embeddings are unavailable. */
  lexicalSearch?: (
    index: { name: string; columns: string[] },
    query: string,
    options: { topK: number; filters?: Record<string, string> },
  ) => Promise<Array<Record<string, unknown> & { score?: number }>>;
};

/** Tenant infrastructure provisioning (catalogs, grants, registries). */
export type ProvisionerPort = {
  provisionTenant: (profile: {
    tenantId: string;
    connections: Array<{ engine: string }>;
  }) => Promise<{ registryLocation: RegistryLocation }>;
};

/** Secret reference resolution — adapters never embed credentials. */
export type SecretResolver = {
  resolve: (secretRef: string) => Promise<string | undefined>;
};
