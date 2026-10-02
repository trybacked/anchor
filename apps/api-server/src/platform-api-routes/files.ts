import { isServiceErrorResult, type DocumentFilesService } from "@trybacked/service";
import { z } from "zod";
import { jsonServiceErrorResponse, respondIfServiceError } from "../platform-api-handler-utils.js";
import type { RouteFactory } from "../platform-api-route-factory.js";
import { platformRoute, postJsonRoute } from "../platform-api-route-factory.js";
import { V1_PATH_PREFIX } from "../platform-api-route-meta.js";

const ListFilesQuerySchema = z.object({
  folder: z.string().optional(),
});

const FilePathQuerySchema = z.object({
  path: z.string().min(1),
});

const FileRefreshBodySchema = z.object({
  fullRefresh: z.boolean().optional(),
});

const RefreshRunIdParamSchema = z.object({
  runId: z.coerce.number().int().positive(),
});

function fileFromFormValue(value: unknown): File | null {
  if (value instanceof File) {
    return value;
  }
  return null;
}

function requireDocumentFilesService(c: {
  get: (key: "documentFilesService") => DocumentFilesService | undefined;
}) {
  const service = c.get("documentFilesService");
  if (service === undefined) {
    throw new Error("documentFilesService not resolved");
  }
  return service;
}

export const platformApiFileRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "uploadFile",
      method: "post",
      path: `${V1_PATH_PREFIX}/files`,
      summary: "Upload a document to the tenant raw volume",
      tags: ["files"],
      requires: "tenant",
      multipartBody: {
        description:
          "Multipart form with required field `file` (binary) and optional `folder` (slug).",
      },
      responses: {
        "201": { description: "Uploaded" },
        "409": { description: "File already exists at path" },
        "413": { description: "Payload too large" },
        "400": { description: "Invalid request" },
        "503": { description: "Unavailable" },
      },
    },
    () => async (c) => {
      const contentLength = c.req.header("content-length");
      if (contentLength !== undefined && Number(contentLength) > 0) {
        const maxHeader = c.req.header("x-backed-max-upload-bytes");
        if (maxHeader !== undefined) {
          // optional future use
        }
      }
      const form = await c.req.parseBody({ all: true });
      const file = fileFromFormValue(form["file"]);
      if (file === null) {
        return c.json({ error: "Missing multipart field file" }, 400);
      }
      const folderRaw = form["folder"];
      const folder =
        typeof folderRaw === "string" && folderRaw.trim().length > 0 ? folderRaw.trim() : undefined;
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await requireDocumentFilesService(c).upload(buffer, {
        filename: file.name,
        ...(folder !== undefined ? { folder } : {}),
      });
      const errorResponse = respondIfServiceError(c, result);
      if (errorResponse !== null) {
        if (isServiceErrorResult(result) && result.error.message.includes("maximum size")) {
          return c.json({ error: result.error.message }, 413);
        }
        return errorResponse;
      }
      return c.json(result, 201);
    },
  ),
  platformRoute(
    {
      operationId: "listFiles",
      method: "get",
      path: `${V1_PATH_PREFIX}/files`,
      summary: "List files under the tenant docs raw volume",
      tags: ["files"],
      requires: "tenant",
      querySchema: ListFilesQuerySchema,
      responses: {
        "200": { description: "Directory listing" },
        "400": { description: "Invalid folder" },
      },
    },
    () => async (c) => {
      const query = ListFilesQuerySchema.parse(c.req.query());
      const result = await requireDocumentFilesService(c).list({
        ...(query.folder !== undefined ? { folder: query.folder } : {}),
      });
      const errorResponse = respondIfServiceError(c, result);
      if (errorResponse !== null) {
        return errorResponse;
      }
      return c.json(result);
    },
  ),
  platformRoute(
    {
      operationId: "deleteFile",
      method: "delete",
      path: `${V1_PATH_PREFIX}/files`,
      summary: "Delete a file from the tenant docs raw volume",
      tags: ["files"],
      requires: "tenant",
      querySchema: FilePathQuerySchema,
      responses: {
        "200": { description: "Deleted" },
        "400": { description: "Invalid path" },
        "404": { description: "Not found" },
      },
    },
    () => async (c) => {
      const { path } = FilePathQuerySchema.parse(c.req.query());
      const decoded = decodeURIComponent(path);
      const result = await requireDocumentFilesService(c).delete(decoded);
      const errorResponse = respondIfServiceError(c, result);
      if (errorResponse !== null) {
        return errorResponse;
      }
      return c.json(result);
    },
  ),
  postJsonRoute(
    {
      operationId: "refreshFiles",
      path: `${V1_PATH_PREFIX}/files/refresh`,
      summary: "Run the docs refresh pipeline job",
      tags: ["files"],
      requires: "tenant",
      jsonBody: {
        componentName: "FileRefreshBody",
        schema: FileRefreshBodySchema,
        example: { fullRefresh: false },
      },
      responses: {
        "202": { description: "Job started" },
        "503": { description: "Job not configured" },
      },
    },
    async (c, body) => {
      const result = await requireDocumentFilesService(c).refresh({
        ...(body.fullRefresh === true ? { fullRefresh: true } : {}),
      });
      if (isServiceErrorResult(result)) {
        return jsonServiceErrorResponse(c, result);
      }
      return c.json(result, 202);
    },
  ),
  platformRoute(
    {
      operationId: "getFileRefresh",
      method: "get",
      path: `${V1_PATH_PREFIX}/files/refresh/{runId}`,
      summary: "Poll docs refresh job run status",
      tags: ["files"],
      requires: "tenant",
      paramSchema: RefreshRunIdParamSchema,
      responses: {
        "200": { description: "Run status" },
        "404": { description: "Run not found" },
      },
    },
    () => async (c) => {
      const { runId } = RefreshRunIdParamSchema.parse(c.req.param());
      const result = await requireDocumentFilesService(c).getRefresh(runId);
      const errorResponse = respondIfServiceError(c, result);
      if (errorResponse !== null) {
        return errorResponse;
      }
      return c.json(result);
    },
  ),
];
