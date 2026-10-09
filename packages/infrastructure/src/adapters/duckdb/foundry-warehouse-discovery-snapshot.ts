import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { FoundryWarehouseDiscoveryProfile } from "./foundry-warehouse-discovery-profile.js";
import { loadFoundryWarehouseDiscoveryProfile } from "./foundry-warehouse-discovery-profile.js";
import { s3BucketFromEnv, s3RegionFromEnv } from "../s3/s3-config.js";

const SNAPSHOT_SUFFIX = "_discovery/warehouse-profile.json";

function snapshotObjectKey(tenantId: string): string {
  const normalized = tenantId.replace(/^\/+|\/+$/g, "");
  return `${normalized}/${SNAPSHOT_SUFFIX}`;
}

function isFoundryWarehouseDiscoveryProfile(value: unknown): value is FoundryWarehouseDiscoveryProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.profile) && Array.isArray(record.samples);
}

export async function loadFoundryWarehouseDiscoveryProfileFromS3(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
}): Promise<FoundryWarehouseDiscoveryProfile | undefined> {
  const bucket = s3BucketFromEnv(options.env);
  if (bucket === undefined) {
    return undefined;
  }
  const client = new S3Client({ region: s3RegionFromEnv(options.env) });
  const key = snapshotObjectKey(options.tenantId);
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    if (response.Body === undefined) {
      return undefined;
    }
    const text = await response.Body.transformToString("utf8");
    const parsed: unknown = JSON.parse(text);
    if (!isFoundryWarehouseDiscoveryProfile(parsed)) {
      return undefined;
    }
    return parsed;
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      (error.name === "NoSuchKey" || error.name === "NotFound")
    ) {
      return undefined;
    }
    console.warn(
      `[discovery] warehouse profile S3 read skipped: tenant=${options.tenantId} reason=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

export async function persistFoundryWarehouseDiscoveryProfileSnapshot(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  catalog: string;
}): Promise<boolean> {
  const bucket = s3BucketFromEnv(options.env);
  if (bucket === undefined) {
    return false;
  }
  const loaded = await loadFoundryWarehouseDiscoveryProfile({
    env: options.env,
    catalog: options.catalog,
  });
  if (loaded === undefined) {
    return false;
  }
  const client = new S3Client({ region: s3RegionFromEnv(options.env) });
  const key = snapshotObjectKey(options.tenantId);
  const body = JSON.stringify(loaded);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  return true;
}

export async function resolveFoundryWarehouseDiscoveryProfile(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  catalog: string;
}): Promise<FoundryWarehouseDiscoveryProfile | undefined> {
  const local = await loadFoundryWarehouseDiscoveryProfile({
    env: options.env,
    catalog: options.catalog,
  });
  if (local !== undefined) {
    return local;
  }
  return loadFoundryWarehouseDiscoveryProfileFromS3(options);
}
