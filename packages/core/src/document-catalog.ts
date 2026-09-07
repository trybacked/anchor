import { z } from "zod";
import { ConfidenceSchema } from "./model.js";
import { DOC_TYPE_TABLE_PREFIX, DOC_TYPE_UNKNOWN_SLUG, DOCUMENT_LINES_TABLE, } from "./tables.js";
export const DocumentFieldSchema = z.object({
    value: z.string().nullable(),
    confidence: ConfidenceSchema,
});
export const DocumentCatalogEntrySchema = z.object({
    sourceTable: z.string().min(1),
    sourceFile: z.string().min(1).optional(),
    documentType: z.string().min(1),
    documentTypeLabel: z.string().min(1),
    protocolNumber: DocumentFieldSchema.optional(),
    publishedDate: DocumentFieldSchema.optional(),
    subject: DocumentFieldSchema.optional(),
    issuingOffice: DocumentFieldSchema.optional(),
    topics: z.array(z.string().min(1)).optional(),
    summary: z.string().min(1).optional(),
    confidence: ConfidenceSchema,
    pageCount: z.number().int().nonnegative(),
});
export const DocumentTypeSummarySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    tableName: z.string().min(1),
    documentCount: z.number().int().nonnegative(),
    confidence: ConfidenceSchema,
    sampleSourceTables: z.array(z.string().min(1)),
});
export const DocumentCatalogSchema = z.object({
    runId: z.string().min(1),
    generatedAt: z.string().datetime(),
    documents: z.array(DocumentCatalogEntrySchema),
    documentTypes: z.array(DocumentTypeSummarySchema),
});
export type DocumentField = z.infer<typeof DocumentFieldSchema>;
export type DocumentCatalogEntry = z.infer<typeof DocumentCatalogEntrySchema>;
export type DocumentTypeSummary = z.infer<typeof DocumentTypeSummarySchema>;
export type DocumentCatalog = z.infer<typeof DocumentCatalogSchema>;
export { DOCUMENT_LINES_TABLE } from "./tables.js";
export function documentTypeTableName(typeId: string): string {
    const normalized = typeId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return `${DOC_TYPE_TABLE_PREFIX}${normalized.length > 0 ? normalized : DOC_TYPE_UNKNOWN_SLUG}`;
}
