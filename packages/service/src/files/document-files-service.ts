import { documentIdFromVolumePath } from "../document-id.js";
import { serviceError, type ServiceErrorResult } from "../service-error.js";
const FOLDER_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const FILENAME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;
export type RefreshRunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type UploadedFile = {
  path: string;
  documentId: string;
  filename: string;
  folder?: string | undefined;
  sizeBytes: number;
};
export type FileEntry = {
  path: string;
  documentId: string;
  name: string;
  isDirectory: boolean;
  sizeBytes?: number | undefined;
  lastModified?: number | undefined;
};
export type ListFilesResponse = {
  prefix: string;
  entries: FileEntry[];
};
export type RefreshRun = {
  runId: number;
  status: RefreshRunStatus;
  message?: string | undefined;
};
export type DocumentVolumeClient = {
  writeFile: (
    path: string,
    data: Uint8Array,
    options?: {
      overwrite?: boolean | undefined;
    },
  ) => Promise<void>;
  listDirectory: (path: string) => Promise<
    Array<{
      path: string;
      name: string;
      isDirectory: boolean;
      fileSize?: number | undefined;
      lastModified?: number | undefined;
    }>
  >;
  deleteFile: (path: string) => Promise<void>;
};
export type DocumentJobsClient = {
  findJobIdByName: (name: string) => Promise<number | null>;
  runNow: (
    jobId: number,
    options?: {
      fullRefresh?: boolean | undefined;
    },
  ) => Promise<{
    runId: number;
  }>;
  getRun: (runId: number) => Promise<{
    runId: number;
    state: string;
    resultState?: string | undefined;
    stateMessage?: string | undefined;
  }>;
};
export type DocumentFilesService = {
  upload: (
    data: Uint8Array,
    options: {
      filename: string;
      folder?: string | undefined;
    },
  ) => Promise<UploadedFile | ServiceErrorResult>;
  list: (options?: {
    folder?: string | undefined;
  }) => Promise<ListFilesResponse | ServiceErrorResult>;
  delete: (path: string) => Promise<
    | {
        ok: true;
      }
    | ServiceErrorResult
  >;
  refresh: (options?: {
    fullRefresh?: boolean | undefined;
  }) => Promise<RefreshRun | ServiceErrorResult>;
  getRefresh: (runId: number) => Promise<RefreshRun | ServiceErrorResult>;
};
export type CreateDocumentFilesServiceOptions = {
  catalog: string;
  docsSchema?: string | undefined;
  files: DocumentVolumeClient;
  jobs: DocumentJobsClient;
  maxUploadBytes: number;
  isFileExistsError?: (error: unknown) => boolean;
};
function documentIdFromPath(path: string): string {
  return documentIdFromVolumePath(path);
}
function volumeRoot(catalog: string, docsSchema: string): string {
  return `/Volumes/${catalog}/${docsSchema}/raw`;
}
function normalizeSegment(
  value: string,
  label: "folder" | "filename",
): string | ServiceErrorResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return serviceError("bad_request", `${label} must not be empty`);
  }
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    return serviceError("bad_request", `Invalid ${label}`);
  }
  const pattern = label === "filename" ? FILENAME_PATTERN : FOLDER_SLUG_PATTERN;
  if (!pattern.test(trimmed)) {
    return serviceError(
      "bad_request",
      `${label} must be lowercase alphanumeric with optional _ - or . (filename only)`,
    );
  }
  return trimmed;
}
function prepareFilename(raw: string): string | ServiceErrorResult {
  const basename = raw.trim().split(/[/\\]/).pop()?.trim() ?? "";
  if (basename.length === 0) {
    return serviceError("bad_request", "filename must not be empty");
  }
  let slug = basename
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]+/g, "");
  if (slug.length === 0) {
    return serviceError("bad_request", "filename has no valid characters after normalization");
  }
  if (!/^[a-z0-9]/.test(slug)) {
    slug = `f_${slug}`;
  }
  return normalizeSegment(slug, "filename");
}
function mapRunStatus(lifeCycle: string, resultState?: string): RefreshRunStatus {
  if (lifeCycle === "PENDING" || lifeCycle === "BLOCKED" || lifeCycle === "WAITING_FOR_RETRY") {
    return "queued";
  }
  if (lifeCycle === "RUNNING" || lifeCycle === "TERMINATING") {
    return "running";
  }
  if (lifeCycle === "TERMINATED") {
    if (resultState === "SUCCESS") {
      return "succeeded";
    }
    if (resultState === "CANCELED") {
      return "canceled";
    }
    return "failed";
  }
  if (lifeCycle === "SKIPPED") {
    return "canceled";
  }
  return "failed";
}
function resolveVolumePath(
  root: string,
  folder: string | undefined,
  filename: string,
): string | ServiceErrorResult {
  const nameResult = prepareFilename(filename);
  if (typeof nameResult !== "string") {
    return nameResult;
  }
  let prefix = root;
  if (folder !== undefined && folder.trim().length > 0) {
    const folderResult = normalizeSegment(folder, "folder");
    if (typeof folderResult !== "string") {
      return folderResult;
    }
    prefix = `${root}/${folderResult}`;
  }
  return `${prefix}/${nameResult}`;
}
function assertUnderRoot(path: string, root: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === root || normalized.startsWith(`${root}/`);
}
function defaultFileExists(error: unknown): boolean {
  return error instanceof Error && error.name === "DatabricksFileExistsError";
}
export function createDocumentFilesService(
  options: CreateDocumentFilesServiceOptions,
): DocumentFilesService {
  const docsSchema = options.docsSchema ?? "docs";
  const root = volumeRoot(options.catalog, docsSchema);
  const refreshJobName = `${options.catalog}-docs-refresh`;
  const isFileExists = options.isFileExistsError ?? defaultFileExists;
  return {
    upload: async (data, uploadOptions) => {
      if (data.byteLength > options.maxUploadBytes) {
        return serviceError(
          "bad_request",
          `File exceeds maximum size of ${String(options.maxUploadBytes)} bytes`,
        );
      }
      const pathResult = resolveVolumePath(root, uploadOptions.folder, uploadOptions.filename);
      if (typeof pathResult !== "string") {
        return pathResult;
      }
      try {
        await options.files.writeFile(pathResult, data, { overwrite: false });
      } catch (error: unknown) {
        if (isFileExists(error)) {
          const message = error instanceof Error ? error.message : "File already exists";
          return serviceError("conflict", message);
        }
        const message = error instanceof Error ? error.message : String(error);
        return serviceError("unavailable", message);
      }
      const filename = pathResult.slice(pathResult.lastIndexOf("/") + 1);
      const folder =
        uploadOptions.folder !== undefined && uploadOptions.folder.trim().length > 0
          ? uploadOptions.folder.trim()
          : undefined;
      return {
        path: pathResult,
        documentId: documentIdFromPath(pathResult),
        filename,
        ...(folder !== undefined ? { folder } : {}),
        sizeBytes: data.byteLength,
      };
    },
    list: async (listOptions) => {
      let prefix = root;
      if (listOptions?.folder !== undefined && listOptions.folder.trim().length > 0) {
        const folderResult = normalizeSegment(listOptions.folder, "folder");
        if (typeof folderResult !== "string") {
          return folderResult;
        }
        prefix = `${root}/${folderResult}`;
      }
      let raw: Awaited<ReturnType<DocumentVolumeClient["listDirectory"]>>;
      try {
        raw = await options.files.listDirectory(prefix);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return serviceError("unavailable", message);
      }
      const entries: FileEntry[] = raw.map((entry) => ({
        path: entry.path,
        documentId: documentIdFromPath(entry.path),
        name: entry.name,
        isDirectory: entry.isDirectory,
        ...(entry.fileSize !== undefined ? { sizeBytes: entry.fileSize } : {}),
        ...(entry.lastModified !== undefined ? { lastModified: entry.lastModified } : {}),
      }));
      return { prefix, entries };
    },
    delete: async (path) => {
      const normalized = path.trim();
      if (!assertUnderRoot(normalized, root)) {
        return serviceError("bad_request", "Path must be under the tenant docs raw volume");
      }
      if (normalized.endsWith("/") || normalized === root) {
        return serviceError("bad_request", "Cannot delete volume root or directory path");
      }
      await options.files.deleteFile(normalized);
      return { ok: true as const };
    },
    refresh: async (refreshOptions) => {
      const jobId = await options.jobs.findJobIdByName(refreshJobName);
      if (jobId === null) {
        return serviceError(
          "unavailable",
          `Docs refresh job "${refreshJobName}" was not found in Databricks`,
        );
      }
      const started = await options.jobs.runNow(jobId, {
        ...(refreshOptions?.fullRefresh === true ? { fullRefresh: true } : {}),
      });
      const run = await options.jobs.getRun(started.runId);
      return {
        runId: run.runId,
        status: mapRunStatus(run.state, run.resultState),
        ...(run.stateMessage !== undefined ? { message: run.stateMessage } : {}),
      };
    },
    getRefresh: async (runId) => {
      if (!Number.isFinite(runId) || runId <= 0) {
        return serviceError("bad_request", "Invalid run id");
      }
      try {
        const run = await options.jobs.getRun(runId);
        return {
          runId: run.runId,
          status: mapRunStatus(run.state, run.resultState),
          ...(run.stateMessage !== undefined ? { message: run.stateMessage } : {}),
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("404")) {
          return serviceError("not_found", "Refresh run not found");
        }
        throw error;
      }
    },
  };
}
