import { z } from "zod";
export const DocumentTypeHintConfigSchema = z.object({
    match: z.string().min(1),
    documentType: z.string().min(1),
    documentTypeLabel: z.string().min(1),
    confidence: z.number().min(0).max(1),
});
export type DocumentTypeHintConfig = z.infer<typeof DocumentTypeHintConfigSchema>;
