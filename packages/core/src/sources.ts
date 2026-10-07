import { z } from "zod";

/**
 * Generic ingested-source model (Plan Phase 4).
 *
 * A `SourceDescriptor` describes one ingested source as data: its kind, the
 * capabilities it exposes, and — for document archives — the binding that maps
 * the archive onto concrete datasets and columns. No table names, entity ids,
 * or language keywords live in the kernel: bindings carry them.
 */

export const SourceKindSchema = z.enum(["table", "document_archive", "api", "stream"]);
/**
 *
 */
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceCapabilitySchema = z.enum(["documents", "tabular", "search"]);
/**
 *
 */
export type SourceCapability = z.infer<typeof SourceCapabilitySchema>;

/** Maps a document archive onto concrete datasets and column names. */
export const DocumentArchiveBindingSchema = z.object({
  datasets: z.object({
    documents: z.string().min(1),
    documentElements: z.string().min(1),
    documentChunks: z.string().min(1),
    documentLines: z.string().min(1),
    documentMentions: z.string().min(1),
    documentEntities: z.string().min(1),
    documentFacts: z.string().min(1),
    documentPages: z.string().min(1),
    entityProfiles: z.string().min(1),
  }),
  columns: z.object({
    documentId: z.string().min(1),
    path: z.string().min(1),
    content: z.string().min(1),
    page: z.string().min(1),
    elementType: z.string().min(1),
  }),
});
/**
 *
 */
export type DocumentArchiveBinding = z.infer<typeof DocumentArchiveBindingSchema>;

export const SourceDescriptorSchema = z.object({
  sourceId: z.string().min(1),
  kind: SourceKindSchema,
  capabilities: z.array(SourceCapabilitySchema).min(1),
  connectionId: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),
  /** Dataset ids owned by the source (tabular/api/stream sources list them here). */
  datasets: z.array(z.string()).optional(),
  binding: DocumentArchiveBindingSchema.optional(),
});
/**
 *
 */
export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;

/** The document datasets the runtime readers need (subset of the binding). */
export type DocumentTablesSpec = {
  documents: string;
  documentElements: string;
  documentEntities: string;
  entityProfiles: string;
};

/** Ontology object ids that behave as documents in provenance extraction. */
export type DocumentObjectIds = {
  document: string;
  documentElement: string;
};

/**
 *
 */
export function sourceHasCapability(
  descriptor: SourceDescriptor,
  capability: SourceCapability,
): boolean {
  return descriptor.capabilities.includes(capability);
}
