import { createRegistrySourceFromEnv } from "@trybacked/core";
import { createTenantArchiveFromEnv, syncDocumentArchiveToWarehouse } from "@trybacked/infrastructure";
import { z } from "zod";
import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { jsonBody, V1_PATH_PREFIX } from "../platform-api-route-meta.js";
import type { PlatformHandlerContext } from "../platform-api-types.js";

const FilesListQuerySchema = z.object({
  folder: z.string().optional(),
});

const FilesRefreshBodySchema = z.object({
  fullRefresh: z.boolean().optional(),
});

const FilesRefreshRunParamSchema = z.object({
  runId: z.coerce.number().int().positive(),
});

type RefreshRunRecord = {
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  message?: string;
};

let nextRefreshRunId = 1;
const refreshRuns = new Map<number, RefreshRunRecord>();

async function tenantCatalog(c: PlatformHandlerContext): Promise<string | null> {
  const tenantId = c.get("tenantId");
  const source = createRegistrySourceFromEnv(process.env);
  const snapshot = await source.load();
  const entry = snapshot.registry.tenants[tenantId];
  if (entry === undefined) {
    return null;
  }
  return entry.catalog;
}

async function tenantArchive(c: PlatformHandlerContext) {
  const tenantId = c.get("tenantId");
  const catalog = await tenantCatalog(c);
  if (catalog === null) {
    return null;
  }
  return createTenantArchiveFromEnv({ env: process.env, tenantId, catalog });
}

export const platformApiFileRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "listTenantFiles",
      method: "get",
      path: `${V1_PATH_PREFIX}/files`,
      summary: "List tenant document archive entries",
      tags: ["files"],
      querySchema: FilesListQuerySchema,
      responses: {
        "200": { description: "Directory listing" },
        "404": { description: "Tenant not in registry" },
      },
    },
    () => async (c) => {
      const archive = await tenantArchive(c);
      if (archive === null) {
        return c.json({ error: "Tenant not in registry" }, 404);
      }
      const query = FilesListQuerySchema.parse(c.req.query());
      const listing = await archive.list(
        query.folder !== undefined && query.folder.length > 0 ? { folder: query.folder } : undefined,
      );
      return c.json(listing);
    },
  ),
  platformRoute(
    {
      operationId: "uploadTenantFile",
      method: "post",
      path: `${V1_PATH_PREFIX}/files`,
      summary: "Upload a file into the tenant document archive",
      tags: ["files"],
      multipartBody: { description: "Multipart upload with file and optional folder" },
      responses: {
        "200": { description: "Uploaded file descriptor" },
        "400": { description: "Invalid multipart body" },
        "404": { description: "Tenant not in registry" },
      },
    },
    () => async (c) => {
      const archive = await tenantArchive(c);
      if (archive === null) {
        return c.json({ error: "Tenant not in registry" }, 404);
      }
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: "Expected multipart form" }, 400);
      }
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return c.json({ error: "Missing file field" }, 400);
      }
      const filenameRaw = form.get("filename");
      const filename =
        typeof filenameRaw === "string" && filenameRaw.length > 0
          ? filenameRaw
          : file instanceof File && file.name.length > 0
            ? file.name
            : "upload.bin";
      const folderRaw = form.get("folder");
      const folder =
        typeof folderRaw === "string" && folderRaw.length > 0 ? folderRaw : undefined;
      const data = new Uint8Array(await file.arrayBuffer());
      const uploaded = await archive.upload({
        filename,
        data,
        ...(folder !== undefined ? { folder } : {}),
        ...(file.type.length > 0 ? { contentType: file.type } : {}),
      });
      return c.json(uploaded);
    },
  ),
  platformRoute(
    {
      operationId: "refreshTenantFiles",
      method: "post",
      path: `${V1_PATH_PREFIX}/files/refresh`,
      summary: "Sync archive files into the tenant document warehouse (DuckDB)",
      tags: ["files"],
      jsonBody: jsonBody("FilesRefreshBody", FilesRefreshBodySchema, { fullRefresh: false }),
      responses: {
        "200": { description: "Refresh run accepted" },
        "404": { description: "Tenant not in registry" },
      },
    },
    (deps) => async (c) => {
      const body = FilesRefreshBodySchema.parse(
        await c.req.json().catch(() => ({})),
      );
      const tenantId = c.get("tenantId");
      const catalog = await tenantCatalog(c);
      if (catalog === null) {
        return c.json({ error: "Tenant not in registry" }, 404);
      }
      const runId = nextRefreshRunId;
      nextRefreshRunId += 1;
      refreshRuns.set(runId, { status: "running" });
      let record: RefreshRunRecord;
      try {
        const outcome = await syncDocumentArchiveToWarehouse({
          env: process.env,
          tenantId,
          catalog,
          fullRefresh: body.fullRefresh === true,
        });
        deps.platformRegistry?.invalidate(tenantId);
        record = {
          status: "succeeded",
          message:
            outcome.indexed === 0
              ? "No files in the archive to index."
              : `Indexed ${String(outcome.indexed)} document(s) in the warehouse.`,
        };
      } catch (error) {
        record = {
          status: "failed",
          message: error instanceof Error ? error.message : "Document index sync failed.",
        };
      }
      refreshRuns.set(runId, record);
      return c.json({ runId, ...record });
    },
  ),
  platformRoute(
    {
      operationId: "getTenantFilesRefresh",
      method: "get",
      path: `${V1_PATH_PREFIX}/files/refresh/{runId}`,
      summary: "Refresh run status",
      tags: ["files"],
      paramSchema: FilesRefreshRunParamSchema,
      responses: {
        "200": { description: "Refresh run status" },
        "404": { description: "Run or tenant not found" },
      },
    },
    () => async (c) => {
      const catalog = await tenantCatalog(c);
      if (catalog === null) {
        return c.json({ error: "Tenant not in registry" }, 404);
      }
      const { runId } = FilesRefreshRunParamSchema.parse(c.req.param());
      const record = refreshRuns.get(runId);
      if (record === undefined) {
        return c.json({ error: "Refresh run not found" }, 404);
      }
      return c.json({ runId, ...record });
    },
  ),
];
