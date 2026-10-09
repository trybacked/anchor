import {
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
  S3Client as S3ClientCtor,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveS3StorageConfig, type S3StorageConfig } from "../s3/s3-config.js";
import { tenantFilesRoot } from "./config.js";

export type TenantArchiveEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  documentId?: string;
};

export type TenantArchiveListResult = {
  entries: TenantArchiveEntry[];
};

export type TenantArchiveUploadResult = {
  path: string;
  name: string;
  documentId: string;
};

export type TenantArchive = {
  list: (options?: { folder?: string | undefined }) => Promise<TenantArchiveListResult>;
  upload: (options: {
    filename: string;
    data: Uint8Array;
    folder?: string | undefined;
    contentType?: string | undefined;
  }) => Promise<TenantArchiveUploadResult>;
};

function canonicalVolumePath(path: string): string {
  const trimmed = path.trim();
  const withoutDbfs = trimmed.startsWith("dbfs:") ? trimmed.slice("dbfs:".length) : trimmed;
  return withoutDbfs.startsWith("/") ? withoutDbfs : `/${withoutDbfs}`;
}

export function documentIdFromVolumePath(volumePath: string): string {
  return createHash("sha256").update(canonicalVolumePath(volumePath), "utf8").digest("hex");
}

function volumePathForCatalog(catalog: string, relativePath: string): string {
  const rel = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  return `/Volumes/${catalog}/docs/raw/${rel}`;
}

function archiveRelativePath(folder: string | undefined, name: string): string {
  if (folder !== undefined && folder.length > 0) {
    return `${folder.replace(/^\/+|\/+$/g, "")}/${name}`;
  }
  return name;
}

function createLocalTenantArchive(options: { root: string; catalog: string }): TenantArchive {
  const { root, catalog } = options;

  async function list(options?: { folder?: string | undefined }): Promise<TenantArchiveListResult> {
    const folder = options?.folder?.replace(/^\/+|\/+$/g, "");
    const dir = folder !== undefined && folder.length > 0 ? join(root, folder) : root;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return { entries: [] };
    }
    const entries: TenantArchiveEntry[] = [];
    for (const name of names) {
      if (name.startsWith(".")) {
        continue;
      }
      const full = join(dir, name);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      const rel = archiveRelativePath(folder, name);
      const path = volumePathForCatalog(catalog, rel);
      if (info.isDirectory()) {
        entries.push({ path, name, isDirectory: true });
        continue;
      }
      if (info.isFile()) {
        entries.push({
          path,
          name,
          isDirectory: false,
          documentId: documentIdFromVolumePath(path),
        });
      }
    }
    entries.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "en", { numeric: true });
    });
    return { entries };
  }

  async function upload(options: {
    filename: string;
    data: Uint8Array;
    folder?: string | undefined;
    contentType?: string | undefined;
  }): Promise<TenantArchiveUploadResult> {
    const folder = options.folder?.replace(/^\/+|\/+$/g, "");
    const safeName = basename(options.filename.replace(/\\/g, "/"));
    const dir = folder !== undefined && folder.length > 0 ? join(root, folder) : root;
    await mkdir(dir, { recursive: true });
    const full = join(dir, safeName);
    await writeFile(full, options.data);
    const rel = archiveRelativePath(folder, safeName);
    const path = volumePathForCatalog(catalog, rel);
    return { path, name: safeName, documentId: documentIdFromVolumePath(path) };
  }

  return { list, upload };
}

function createS3TenantArchive(options: {
  config: S3StorageConfig;
  catalog: string;
  client?: S3Client;
}): TenantArchive {
  const client =
    options.client ??
    new S3ClientCtor({
      region: options.config.region,
    });
  const { bucket, tenantPrefix } = options.config;
  const { catalog } = options;

  function listPrefix(folder: string | undefined): string {
    const normalized = folder?.replace(/^\/+|\/+$/g, "");
    if (normalized !== undefined && normalized.length > 0) {
      return `${tenantPrefix}${normalized}/`;
    }
    return tenantPrefix;
  }

  async function list(options?: { folder?: string | undefined }): Promise<TenantArchiveListResult> {
    const folder = options?.folder?.replace(/^\/+|\/+$/g, "");
    const prefix = listPrefix(folder);
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
      }),
    );
    const entries: TenantArchiveEntry[] = [];
    for (const commonPrefix of response.CommonPrefixes ?? []) {
      const key = commonPrefix.Prefix ?? "";
      if (!key.startsWith(prefix)) {
        continue;
      }
      const name = key.slice(prefix.length).replace(/\/$/, "");
      if (name.length === 0 || name.includes("/")) {
        continue;
      }
      const rel = archiveRelativePath(folder, name);
      entries.push({
        path: volumePathForCatalog(catalog, rel),
        name,
        isDirectory: true,
      });
    }
    for (const object of response.Contents ?? []) {
      const key = object.Key ?? "";
      if (!key.startsWith(prefix) || key.endsWith("/")) {
        continue;
      }
      const name = key.slice(prefix.length);
      if (name.length === 0 || name.includes("/")) {
        continue;
      }
      const rel = archiveRelativePath(folder, name);
      const path = volumePathForCatalog(catalog, rel);
      entries.push({
        path,
        name,
        isDirectory: false,
        documentId: documentIdFromVolumePath(path),
      });
    }
    entries.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "en", { numeric: true });
    });
    return { entries };
  }

  async function upload(options: {
    filename: string;
    data: Uint8Array;
    folder?: string | undefined;
    contentType?: string | undefined;
  }): Promise<TenantArchiveUploadResult> {
    const folder = options.folder?.replace(/^\/+|\/+$/g, "");
    const safeName = basename(options.filename.replace(/\\/g, "/"));
    const rel = archiveRelativePath(folder, safeName);
    const key = `${tenantPrefix}${rel}`.replace(/\/{2,}/g, "/");
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: options.data,
        ...(options.contentType !== undefined && options.contentType.length > 0
          ? { ContentType: options.contentType }
          : {}),
      }),
    );
    const path = volumePathForCatalog(catalog, rel);
    return { path, name: safeName, documentId: documentIdFromVolumePath(path) };
  }

  return { list, upload };
}

export function createTenantArchiveFromEnv(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
  catalog: string;
}): TenantArchive {
  const s3Config = resolveS3StorageConfig(options.env, options.tenantId);
  if (s3Config !== undefined) {
    return createS3TenantArchive({ config: s3Config, catalog: options.catalog });
  }
  const root = tenantFilesRoot(options.env, options.tenantId);
  return createLocalTenantArchive({ root, catalog: options.catalog });
}
