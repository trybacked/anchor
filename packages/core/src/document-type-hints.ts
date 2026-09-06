import { z } from "zod";

/** Workspace-configurable filename slug rule for document classification. */
export const DocumentTypeHintConfigSchema = z.object({
  /** Case-insensitive substring matched against the ingested table slug. */
  match: z.string().min(1),
  documentType: z.string().min(1),
  documentTypeLabel: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type DocumentTypeHintConfig = z.infer<typeof DocumentTypeHintConfigSchema>;
