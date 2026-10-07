import type { SqlStatementExecutor } from "../execute.js";
import type { DocumentsDatasetResolver } from "./dataset.js";
export type DocumentMetadata = {
  documentId: string;
  filename: string;
  docType: string;
  pageCount: number;
  entityCount: number;
  folder?: string | undefined;
  status: "ready";
  contentType: string;
  sourceModifiedAt?: string | undefined;
  fileSizeBytes?: number | undefined;
};
export type DocumentPreviewDescriptor = {
  kind: "volumeFile";
  documentId: string;
  page: number;
  pageCount: number;
  filename: string;
  contentType: string;
};
export type VolumeFileReadResult = {
  status: 200 | 206;
  data: Uint8Array;
  contentType: string;
  contentLength?: number | undefined;
  contentRange?: string | undefined;
  acceptRanges?: string | undefined;
};
export type VolumeFileReader = (
  path: string,
  init?: {
    range?: string | undefined;
  },
) => Promise<VolumeFileReadResult>;
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
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
  return "application/octet-stream";
}
function stringField(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function numberField(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
export function createDocumentAccessReader(options: {
  executor: SqlStatementExecutor;
  documents: DocumentsDatasetResolver;
  readVolumeFile?: VolumeFileReader | undefined;
}) {
  const { executor, documents, readVolumeFile } = options;
  const table = documents.documentsTable;
  const entitiesTable = documents.documentEntitiesTable;
  async function loadRow(documentId: string): Promise<Record<string, unknown> | null> {
    const sql = `SELECT
  d.${quoteIdentifier("document_id")},
  d.${quoteIdentifier("filename")},
  d.${quoteIdentifier("path")},
  d.${quoteIdentifier("doc_type")},
  d.${quoteIdentifier("page_count")},
  d.${quoteIdentifier("folder")},
  d.${quoteIdentifier("source_modified_at")},
  d.${quoteIdentifier("file_size")},
  COALESCE(e.entity_count, 0) AS entity_count
FROM ${table} d
LEFT JOIN (
  SELECT ${quoteIdentifier("document_id")}, COUNT(*) AS entity_count
  FROM ${entitiesTable}
  GROUP BY ${quoteIdentifier("document_id")}
) e ON d.${quoteIdentifier("document_id")} = e.${quoteIdentifier("document_id")}
WHERE d.${quoteIdentifier("document_id")} = :documentId
LIMIT 1`;
    const rows = await executor(sql, [{ name: "documentId", value: documentId }]);
    return rows[0] ?? null;
  }
  return {
    getMetadata: async (documentId: string): Promise<DocumentMetadata | null> => {
      const row = await loadRow(documentId);
      if (row === null) {
        return null;
      }
      const filename = stringField(row, "filename");
      const docType = stringField(row, "doc_type") ?? "other";
      const pageCount = numberField(row, "page_count") ?? 0;
      if (filename === undefined) {
        return null;
      }
      const modified = row["source_modified_at"];
      return {
        documentId,
        filename,
        docType,
        pageCount,
        entityCount: numberField(row, "entity_count") ?? 0,
        status: "ready",
        contentType: contentTypeFromFilename(filename),
        ...(stringField(row, "folder") !== undefined ? { folder: stringField(row, "folder") } : {}),
        ...(typeof modified === "string" ? { sourceModifiedAt: modified } : {}),
        ...(numberField(row, "file_size") !== undefined
          ? { fileSizeBytes: numberField(row, "file_size") }
          : {}),
      };
    },
    describePreview: async (
      documentId: string,
      page: number,
    ): Promise<DocumentPreviewDescriptor | null> => {
      const metadata = await loadRow(documentId);
      if (metadata === null) {
        return null;
      }
      const filename = stringField(metadata, "filename");
      const pageCount = numberField(metadata, "page_count") ?? 0;
      if (filename === undefined) {
        return null;
      }
      return {
        kind: "volumeFile",
        documentId,
        page,
        pageCount,
        filename,
        contentType: contentTypeFromFilename(filename),
      };
    },
    readOriginalFile: async (
      documentId: string,
      init?: {
        range?: string | undefined;
      },
    ): Promise<
      VolumeFileReadResult & {
        filename: string;
      }
    > => {
      if (readVolumeFile === undefined) {
        throw new Error(
          "Document file preview is unavailable: configure local file access via BACKED_FILES_ROOT.",
        );
      }
      const row = await loadRow(documentId);
      if (row === null) {
        throw new Error(`Document "${documentId}" not found.`);
      }
      const path = stringField(row, "path");
      const filename = stringField(row, "filename") ?? "document";
      if (path === undefined) {
        throw new Error(`Document "${documentId}" has no storage path.`);
      }
      const file = await readVolumeFile(path, init);
      return { ...file, filename };
    },
  };
}
export type DocumentAccessReader = ReturnType<typeof createDocumentAccessReader>;
