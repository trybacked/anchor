import type { OntologyStore } from "@trybacked/registry";
import { createVolumeOntologyStore } from "@trybacked/registry";
import { createFilesystemBlobStore } from "./adapters/files/filesystem-blob-store.js";
import { createFilesystemOntologyStore } from "./adapters/files/files-registry.js";
import { filesRegistryBaseFromEnv } from "./adapters/files/config.js";
import { createS3BlobStoreFromEnv, defaultOntologyRegistryS3Prefix } from "./adapters/s3/s3-blob-store.js";
import { s3BucketFromEnv } from "./adapters/s3/s3-config.js";

export type OntologyRegistryStorage = "filesystem" | "s3";

const VOLUME_LAYOUT = {
  root: "",
  schema: "backed",
  volume: "registry",
} as const;

export function resolveOntologyRegistryStorage(
  env: Record<string, string | undefined> = process.env,
): OntologyRegistryStorage {
  const explicit = env["BACKED_ONTOLOGY_REGISTRY_STORAGE"]?.trim().toLowerCase();
  if (explicit === "s3") {
    return "s3";
  }
  if (explicit === "filesystem" || explicit === "file") {
    return "filesystem";
  }
  return "filesystem";
}

export function createOntologyStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
  options?: { workspaceRoot?: string },
): OntologyStore {
  const storage = resolveOntologyRegistryStorage(env);
  if (storage === "s3") {
    const bucket = s3BucketFromEnv(env);
    if (bucket === undefined) {
      throw new Error(
        'BACKED_ONTOLOGY_REGISTRY_STORAGE=s3 requires BACKED_S3_BUCKET (or BACKED_S3_USE_DEFAULT_BUCKET=1).',
      );
    }
    const blobs = createS3BlobStoreFromEnv(env);
    if (blobs === undefined) {
      throw new Error("Failed to create S3 ontology registry client.");
    }
    return createVolumeOntologyStore(blobs, VOLUME_LAYOUT);
  }
  return createFilesystemOntologyStore({
    registryBasePath: filesRegistryBaseFromEnv(env, options?.workspaceRoot),
  });
}

export function ontologyRegistryLocationHint(
  env: Record<string, string | undefined> = process.env,
): string {
  if (resolveOntologyRegistryStorage(env) === "s3") {
    const bucket = s3BucketFromEnv(env) ?? "(missing bucket)";
    return `s3://${bucket}/${defaultOntologyRegistryS3Prefix(env)}`;
  }
  return filesRegistryBaseFromEnv(env);
}

/** @deprecated use createOntologyStoreFromEnv — kept for callers passing registryBasePath only */
export function createOntologyStoreForRegistryRoot(registryBasePath: string): OntologyStore {
  const blobs = createFilesystemBlobStore(registryBasePath);
  return createVolumeOntologyStore(blobs, VOLUME_LAYOUT);
}
