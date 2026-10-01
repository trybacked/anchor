import type { DatabricksProviderConfig } from "./config.js";

function apiBaseUrl(host: string): string {
  return `https://${host}`;
}

/** Normalize paths from warehouse (`/Volumes/...` or `dbfs:/Volumes/...`). */
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

export type DatabricksFilesClient = {
  readFile: (
    path: string,
    init?: { range?: string | undefined },
  ) => Promise<DatabricksFileReadResult>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
};

export type DatabricksBlobStore = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string) => Promise<void>;
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
  return {
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

    writeFile: async (rawPath, data) => {
      const path = normalizeDatabricksVolumePath(rawPath);
      const url = `${apiBaseUrl(config.host)}/api/2.0/fs/files${encodeURI(path)}?overwrite=true`;
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
    write: async (path, text) => {
      await client.writeFile(path, new TextEncoder().encode(text));
    },
  };
}
