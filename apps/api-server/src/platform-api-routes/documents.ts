import { documentErrorStatus } from "../platform-api-handler-utils.js";
import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { V1_PATH_PREFIX } from "../platform-api-route-meta.js";
import { DocumentIdParamSchema, DocumentPreviewQuerySchema } from "../platform-api-schemas.js";

export const platformApiDocumentRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "getDocument",
      method: "get",
      path: `${V1_PATH_PREFIX}/documents/{id}`,
      summary: "Document metadata",
      tags: ["documents"],
      paramSchema: DocumentIdParamSchema,
      responses: {
        "200": { description: "Document metadata" },
        "404": { description: "Not found" },
        "503": { description: "Unavailable" },
      },
    },
    () => async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const result = await c.get("anchorService").getDocument(id);
      if ("error" in result) {
        return c.json({ error: result.error }, documentErrorStatus(result.error));
      }
      return c.json(result);
    },
  ),
  platformRoute(
    {
      operationId: "getDocumentPreview",
      method: "get",
      path: `${V1_PATH_PREFIX}/documents/{id}/preview`,
      summary: "PDF preview page",
      tags: ["documents"],
      paramSchema: DocumentIdParamSchema,
      querySchema: DocumentPreviewQuerySchema,
      responses: {
        "200": { description: "PDF bytes or JSON preview descriptor (Accept: application/json)" },
        "404": { description: "Not found" },
        "503": { description: "Unavailable" },
      },
    },
    () => async (c) => {
      const { id } = DocumentIdParamSchema.parse(c.req.param());
      const { page, format } = DocumentPreviewQuerySchema.parse(c.req.query());
      const accept = c.req.header("accept") ?? "";
      const wantsJson =
        format === "json" || (format !== "file" && accept.includes("application/json"));
      const service = c.get("anchorService");
      if (wantsJson) {
        const descriptor = await service.describeDocumentPreview(id, page);
        if ("error" in descriptor) {
          return c.json({ error: descriptor.error }, documentErrorStatus(descriptor.error));
        }
        return c.json(descriptor);
      }
      const range = c.req.header("range") ?? undefined;
      const preview = await service.readDocumentPreview(id, { page, range });
      if ("error" in preview) {
        return c.json({ error: preview.error }, documentErrorStatus(preview.error));
      }
      const { file } = preview;
      const headers: Record<string, string> = {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${file.filename.replaceAll('"', "")}"`,
        "x-backed-document-page": String(page),
      };
      if (file.contentLength !== undefined) {
        headers["content-length"] = String(file.contentLength);
      }
      if (file.contentRange !== undefined) {
        headers["content-range"] = file.contentRange;
      }
      if (file.acceptRanges !== undefined) {
        headers["accept-ranges"] = file.acceptRanges;
      }
      return new Response(file.data, { status: file.status, headers });
    },
  ),
];
