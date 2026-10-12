import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { BlobStore } from "@trybacked/registry";
import { s3BucketFromEnv, s3RegionFromEnv } from "./s3-config.js";

export type S3BlobStoreOptions = {
  bucket: string;
  region: string;
  keyPrefix: string;
  client?: S3Client;
};

function normalizeKeyPrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? `${trimmed}/` : "";
}

function objectKey(prefix: string, path: string): string {
  const relative = path.replace(/^\/+/, "");
  const key = `${prefix}${relative}`.replace(/\/{2,}/g, "/");
  return key;
}

export function defaultOntologyRegistryS3Prefix(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env["BACKED_ONTOLOGY_REGISTRY_S3_PREFIX"]?.trim();
  if (configured !== undefined && configured.length > 0) {
    return normalizeKeyPrefix(configured);
  }
  return "_ontology-registry/";
}

export function createS3BlobStore(options: S3BlobStoreOptions): BlobStore {
  const prefix = normalizeKeyPrefix(options.keyPrefix);
  const client =
    options.client ??
    new S3Client({
      region: options.region,
    });

  return {
    read: async (path: string) => {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: options.bucket,
            Key: objectKey(prefix, path),
          }),
        );
        if (response.Body === undefined) {
          return null;
        }
        return await response.Body.transformToString("utf8");
      } catch (error) {
        if (
          error !== null &&
          typeof error === "object" &&
          "name" in error &&
          (error.name === "NoSuchKey" || error.name === "NotFound")
        ) {
          return null;
        }
        throw error;
      }
    },
    write: async (path: string, text: string, writeOptions) => {
      const key = objectKey(prefix, path);
      if (writeOptions?.overwrite !== true) {
        try {
          await client.send(
            new HeadObjectCommand({
              Bucket: options.bucket,
              Key: key,
            }),
          );
          throw new Error(`Blob already exists at ${path}`);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Blob already exists")) {
            throw error;
          }
        }
      }
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          Body: text,
          ContentType: "application/json; charset=utf-8",
        }),
      );
    },
  };
}

export function createS3BlobStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobStore | undefined {
  const bucket = s3BucketFromEnv(env);
  if (bucket === undefined) {
    return undefined;
  }
  return createS3BlobStore({
    bucket,
    region: s3RegionFromEnv(env),
    keyPrefix: defaultOntologyRegistryS3Prefix(env),
  });
}
