import type { Ontology } from "@trybacked/core";
import { z } from "zod";

export type ObjectStorage = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string, options?: { overwrite?: boolean }) => Promise<void>;
};

export const RegistryLocationSchema = z.object({
  container: z.string().min(1),

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

export type JobRunner = {
  findJobByName: (name: string) => Promise<{ jobId: string } | null>;
  runNow: (jobId: string) => Promise<{ runId: string }>;
  getRunStatus: (runId: string) => Promise<"pending" | "running" | "completed" | "failed">;
};

export type SearchIndexPort = {
  semanticSearch: (
    index: { name: string; columns: string[] },
    query: string,
    options: { topK: number; filters?: Record<string, string> },
  ) => Promise<Array<Record<string, unknown> & { score?: number }>>;

  lexicalSearch?: (
    index: { name: string; columns: string[] },
    query: string,
    options: { topK: number; filters?: Record<string, string> },
  ) => Promise<Array<Record<string, unknown> & { score?: number }>>;
};

export type ProvisionerPort = {
  provisionTenant: (profile: {
    tenantId: string;
    connections: Array<{ engine: string }>;
  }) => Promise<{ registryLocation: RegistryLocation }>;
};

export type SecretResolver = {
  resolve: (secretRef: string) => Promise<string | undefined>;
};
