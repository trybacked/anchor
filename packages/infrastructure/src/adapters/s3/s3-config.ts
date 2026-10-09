import { DEFAULT_BACKED_S3_BUCKET, DEFAULT_BACKED_S3_REGION } from "@trybacked/core";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  tenantPrefix: string;
};

const RAW_SEGMENT = "/raw/";
const VOLUME_ROOT = /^Volumes\/[^/]+\//;

function envValue(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function tenantPrefixFor(tenantId: string): string {
  const normalized = tenantId.replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? `${normalized}/` : "";
}

function documentRelativePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/^\/+/, "");
  const rawIndex = normalized.indexOf(RAW_SEGMENT);
  if (rawIndex >= 0) {
    return normalized.slice(rawIndex + RAW_SEGMENT.length).replace(/^\/+/, "");
  }
  return normalized.replace(VOLUME_ROOT, "");
}

export function s3BucketFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const configured = envValue(env, "BACKED_S3_BUCKET");
  if (configured !== undefined) {
    return configured;
  }
  const useDefault = envValue(env, "BACKED_S3_USE_DEFAULT_BUCKET");
  if (useDefault === "1" || useDefault === "true") {
    return DEFAULT_BACKED_S3_BUCKET;
  }
  return undefined;
}

export function s3RegionFromEnv(env: Record<string, string | undefined> = process.env): string {
  return envValue(env, "BACKED_S3_REGION") ?? DEFAULT_BACKED_S3_REGION;
}

export function resolveS3StorageConfig(
  env: Record<string, string | undefined>,
  tenantId: string,
): S3StorageConfig | undefined {
  const bucket = s3BucketFromEnv(env);
  if (bucket === undefined) {
    return undefined;
  }
  return {
    bucket,
    region: s3RegionFromEnv(env),
    tenantPrefix: tenantPrefixFor(tenantId),
  };
}

export function s3ObjectKey(sourcePath: string, tenantPrefix: string): string {
  const relative = documentRelativePath(sourcePath);
  const alreadyPrefixed =
    tenantPrefix.length > 0 &&
    (relative === tenantPrefix.slice(0, -1) || relative.startsWith(tenantPrefix));
  const key = alreadyPrefixed ? relative : `${tenantPrefix}${relative}`;
  return key.replace(/\/{2,}/g, "/");
}
