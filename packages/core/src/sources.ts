import { z } from "zod";

export const SourceKindSchema = z.enum(["table", "document_archive", "api", "stream"]);

export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceCapabilitySchema = z.enum(["documents", "tabular", "search"]);

export type SourceCapability = z.infer<typeof SourceCapabilitySchema>;

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

export type DocumentArchiveBinding = z.infer<typeof DocumentArchiveBindingSchema>;

export const SourceDescriptorSchema = z.object({
  sourceId: z.string().min(1),
  kind: SourceKindSchema,
  capabilities: z.array(SourceCapabilitySchema).min(1),
  connectionId: z.string().min(1).optional(),
  namespace: z.string().min(1).optional(),

  datasets: z.array(z.string()).optional(),
  binding: DocumentArchiveBindingSchema.optional(),
});

export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;

export type DocumentTablesSpec = {
  documents: string;
  documentElements: string;
  documentEntities: string;
  entityProfiles: string;
};

export type DocumentObjectIds = {
  document: string;
  documentElement: string;
};

export function sourceHasCapability(
  descriptor: SourceDescriptor,
  capability: SourceCapability,
): boolean {
  return descriptor.capabilities.includes(capability);
}
