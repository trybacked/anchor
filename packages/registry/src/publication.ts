import { OntologySchema } from "@trybacked/core";
import { z } from "zod";

export const PublicationRecordSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string().datetime(),
  runId: z.string().min(1),
  ontology: OntologySchema,
});

export type PublicationRecord = z.infer<typeof PublicationRecordSchema>;
