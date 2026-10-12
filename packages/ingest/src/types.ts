import { z } from "zod";

export const IngestFileRecordSchema = z.object({
  relativePath: z.string().min(1),
  collection: z.string().min(1),
  sha256: z.string().min(64).max(64),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string().datetime(),
});

export type IngestFileRecord = z.infer<typeof IngestFileRecordSchema>;

export const IngestManifestSchema = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  updatedAt: z.string().datetime(),
  files: z.array(IngestFileRecordSchema),
});

export type IngestManifest = z.infer<typeof IngestManifestSchema>;

export type IngestProgressEvent =
  | { stage: "index"; indexed: number; total: number }
  | { stage: "parse"; path: string; status: "ok" | "skipped" | "error"; message?: string }
  | { stage: "chunk"; chunks: number }
  | { stage: "done"; manifestPath: string };
