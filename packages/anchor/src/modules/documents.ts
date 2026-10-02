import type { DocumentPreviewResponse, GetDocumentResponse } from "@trybacked/service";
import type { TenantApiContext } from "../scope.js";
import type { Transport } from "../transport.js";

export function createDocumentsModule(transport: Transport, ctx: TenantApiContext) {
  return {
    get: (documentId: string) =>
      transport.requestJson<GetDocumentResponse>(
        "GET",
        ctx.url(`/v1/documents/${encodeURIComponent(documentId)}`),
        { headers: ctx.headers },
      ),

    preview: (documentId: string, page = 1) =>
      transport.requestJson<DocumentPreviewResponse>(
        "GET",
        ctx.url(
          `/v1/documents/${encodeURIComponent(documentId)}/preview?page=${String(page)}&format=json`,
        ),
        { headers: ctx.headers },
      ),

    previewUrl: (documentId: string, page = 1) =>
      ctx.url(
        `/v1/documents/${encodeURIComponent(documentId)}/preview?page=${String(page)}&format=file`,
      ),
  };
}
