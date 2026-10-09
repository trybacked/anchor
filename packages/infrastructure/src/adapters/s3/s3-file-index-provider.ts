import { ListObjectsV2Command, type S3Client, S3Client as S3ClientCtor } from "@aws-sdk/client-s3";
import { basename, extname } from "node:path";
import {
  createFileIndexDatasetProviderFromLoader,
  type FileCollection,
  type FileIndexEntry,
} from "../files/file-index-provider.js";
import type { S3StorageConfig } from "./s3-config.js";

function entryFromKey(relativePath: string, sizeBytes: number, modifiedAt: string): FileIndexEntry {
  const fileName = basename(relativePath);
  return {
    relativePath,
    fileName,
    extension: extname(fileName).replace(/^\./, "").toLowerCase(),
    sizeBytes,
    modifiedAt,
  };
}

async function loadCollectionsFromS3(
  config: S3StorageConfig,
  client: S3Client,
): Promise<Map<string, FileCollection>> {
  const collections = new Map<string, FileCollection>();
  const byCollection = new Map<string, FileIndexEntry[]>();
  const rootFiles: FileIndexEntry[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.tenantPrefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents ?? []) {
      const key = object.Key ?? "";
      if (!key.startsWith(config.tenantPrefix) || key.endsWith("/")) {
        continue;
      }
      const relative = key.slice(config.tenantPrefix.length);
      if (relative.length === 0 || relative.startsWith(".")) {
        continue;
      }
      const modifiedAt = object.LastModified?.toISOString() ?? new Date().toISOString();
      const sizeBytes = object.Size ?? 0;
      const entry = entryFromKey(relative, sizeBytes, modifiedAt);
      const slash = relative.indexOf("/");
      if (slash < 0) {
        rootFiles.push(entry);
        continue;
      }
      const collectionId = relative.slice(0, slash);
      if (collectionId.length === 0 || collectionId.startsWith(".")) {
        continue;
      }
      const bucket = byCollection.get(collectionId) ?? [];
      bucket.push(entry);
      byCollection.set(collectionId, bucket);
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken !== undefined);

  for (const [id, entries] of byCollection) {
    if (entries.length > 0) {
      collections.set(id, { id, entries });
    }
  }
  if (rootFiles.length > 0) {
    collections.set("_root", { id: "_root", entries: rootFiles });
  }
  return collections;
}

export function createS3FileIndexDatasetProvider(options: {
  config: S3StorageConfig;
  client?: S3Client;
}) {
  const client =
    options.client ??
    new S3ClientCtor({
      region: options.config.region,
    });
  const provenance = `s3://${options.config.bucket}/${options.config.tenantPrefix}`;
  return createFileIndexDatasetProviderFromLoader({
    provenance,
    load: () => loadCollectionsFromS3(options.config, client),
  });
}
