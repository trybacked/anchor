import type { DatabricksProviderConfig } from "./config.js";

function apiBaseUrl(host: string): string {
  return `https://${host}`;
}

export function normalizeDatabricksVolumePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("dbfs:")) {
    return trimmed.slice("dbfs:".length);
  }
  return trimmed;
}

export type DatabricksFileReadResult = {
  status: 200 | 206;
  data: Uint8Array;
  contentType: string;
  contentLength?: number | undefined;
  contentRange?: string | undefined;
  acceptRanges?: string | undefined;
};

export type DatabricksDirectoryEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  fileSize?: number | undefined;
  lastModified?: number | undefined;
};

export type DatabricksFileStat = {
  path: string;
  fileSize: number;
  lastModified?: number | undefined;
};

export class DatabricksFileExistsError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`File already exists: ${path}`);
    this.name = "DatabricksFileExistsError";
    this.path = path;
  }
}

export type DatabricksFilesClient = {
  readFile: (
    path: string,
    init?: { range?: string | undefined },
  ) => Promise<DatabricksFileReadResult>;
  writeFile: (
    path: string,
    data: Uint8Array,
    options?: { overwrite?: boolean | undefined },
  ) => Promise<void>;
  statFile: (path: string) => Promise<DatabricksFileStat | null>;
  listDirectory: (path: string) => Promise<DatabricksDirectoryEntry[]>;
  deleteFile: (path: string) => Promise<void>;
};

export type DatabricksBlobStoreWriteOptions = {
  overwrite?: boolean | undefined;
};

export type DatabricksBlobStore = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string, options?: DatabricksBlobStoreWriteOptions) => Promise<void>;
};

function contentTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export function createDatabricksFilesClient(
  config: DatabricksProviderConfig,
): DatabricksFilesClient {
  const client: DatabricksFilesClient = {
    readFile: async (rawPath, init) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/files${encodeURI(path)}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.token}`,
      };
      if (init?.range !== undefined && init.range.length > 0) {
        headers["Range"] = init.range;
      }
      const response = await fetch(url, { headers });
      if (response.status !== 200 && response.status !== 206) {
        const body = await response.text();
        throw new Error(
          `Databricks files API ${String(response.status)} for "${path}": ${body.slice(0, 240)}`,
        );
      }
      const buffer = await response.arrayBuffer();
      const contentTypeHeader = response.headers.get("content-type");
      const filename = path.split("/").pop() ?? "document";
      const contentType =
        contentTypeHeader !== null && contentTypeHeader.length > 0
          ? (contentTypeHeader.split(";")[0]?.trim() ?? contentTypeFromFilename(filename))
          : contentTypeFromFilename(filename);
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength =
        contentLengthHeader !== null && contentLengthHeader.length > 0
          ? Number(contentLengthHeader)
          : undefined;
      const contentRange = response.headers.get("content-range") ?? undefined;
      const acceptRanges = response.headers.get("accept-ranges") ?? undefined;
      return {
        status: response.status === 206 ? 206 : 200,
        data: new Uint8Array(buffer),
        contentType,
        ...(contentLength !== undefined && !Number.isNaN(contentLength) ? { contentLength } : {}),
        ...(contentRange !== undefined ? { contentRange } : {}),
        ...(acceptRanges !== undefined ? { acceptRanges } : {}),
      };
    },

    statFile: async (rawPath) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/files${encodeURI(path)}`;
      const response = await fetch(url, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Databricks files API HEAD ${String(response.status)} for "${path}": ${body.slice(0, 240)}`,
        );
      }
      const lengthHeader = response.headers.get("content-length");
      const fileSize = lengthHeader !== null && lengthHeader.length > 0 ? Number(lengthHeader) : 0;
      const modifiedHeader = response.headers.get("last-modified");
      const lastModified =
        modifiedHeader !== null && modifiedHeader.length > 0
          ? Date.parse(modifiedHeader)
          : undefined;
      return {
        path,
        fileSize: Number.isNaN(fileSize) ? 0 : fileSize,
        ...(lastModified !== undefined && !Number.isNaN(lastModified) ? { lastModified } : {}),
      };
    },

    listDirectory: async (rawPath) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/directories${encodeURI(path)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (response.status === 404) {
        return [];
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Databricks directories API ${String(response.status)} for "${path}": ${body.slice(0, 240)}`,
        );
      }
      const payload = (await response.json()) as {
        contents?: Array<{
          path?: string;
          name?: string;
          is_directory?: boolean;
          file_size?: number;
          last_modified?: number;
        }>;
      };
      return (payload.contents ?? []).flatMap((entry) => {
        if (entry.path === undefined || entry.name === undefined) {
          return [];
        }
        return [
          {
            path: entry.path,
            name: entry.name,
            isDirectory: entry.is_directory === true,
            ...(entry.file_size !== undefined ? { fileSize: entry.file_size } : {}),
            ...(entry.last_modified !== undefined ? { lastModified: entry.last_modified } : {}),
          },
        ];
      });
    },

    deleteFile: async (rawPath) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/files${encodeURI(path)}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (response.status === 404) {
        return;
      }
      if (response.status !== 204 && response.status !== 200) {
        const body = await response.text();
        throw new Error(
          `Databricks files API DELETE ${String(response.status)} for "${path}": ${body.slice(0, 240)}`,
        );
      }
    },

    writeFile: async (rawPath, data, options) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const overwrite = options?.overwrite === true;
      if (!overwrite) {
        const existing = await client.statFile(path);
        if (existing !== null) {
          throw new DatabricksFileExistsError(path);
        }
      }
      const overwriteQuery = overwrite ? "true" : "false";
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/files${encodeURI(path)}?overwrite=${overwriteQuery}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/octet-stream",
        },
        body: data,
      });
      if (response.status !== 204 && response.status !== 200) {
        const body = await response.text();
        throw new Error(
          `Databricks files API PUT ${String(response.status)} for "${path}": ${body.slice(0, 240)}`,
        );
      }
    },
  };
  return client;
}

export function createDatabricksBlobStore(config: DatabricksProviderConfig): DatabricksBlobStore {
  const client = createDatabricksFilesClient(config);
  return {
    read: async (path) => {
      try {
        const file = await client.readFile(path);
        return new TextDecoder().decode(file.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("404")) {
          return null;
        }
        throw error;
      }
    },
    write: async (path: string, text: string, options?: DatabricksBlobStoreWriteOptions) => {
      await client.writeFile(path, new TextEncoder().encode(text), {
        overwrite: options?.overwrite === true,
      });
    },
  };
}
