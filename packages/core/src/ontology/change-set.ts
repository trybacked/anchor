import { z } from "zod";
import { AuthoringCommandV2Schema, type AuthoringCommandV2 } from "./spec-v2-authoring.js";

export const ChangeSetEvidenceSchema = z.object({
  sourceUri: z.string().min(1).optional(),
  datasetId: z.string().min(1).optional(),
  columnName: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
  sampleValues: z.array(z.string()).max(8).default([]),
});

/**
 *
 */
export type ChangeSetEvidence = z.infer<typeof ChangeSetEvidenceSchema>;

export const ChangeSetEntrySchema = z.object({
  id: z.string().min(1),
  command: z.unknown(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  evidence: z.array(ChangeSetEvidenceSchema).default([]),
});

/**
 *
 */
export type ChangeSetEntry = z.infer<typeof ChangeSetEntrySchema>;

export const OntologyChangeSetSchema = z.object({
  changeSetId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  formatVersion: z.literal("2"),
  changes: z.array(ChangeSetEntrySchema),
  status: z.enum(["proposed", "approved", "rejected", "applied"]).default("proposed"),
});

/**
 *
 */
export type OntologyChangeSet = z.infer<typeof OntologyChangeSetSchema>;

/**
 *
 */
export type ValidatedChangeSet = OntologyChangeSet & {
  changes: Array<ChangeSetEntry & { command: AuthoringCommandV2 }>;
};

/**
 *
 */
export function parseChangeSet(input: unknown): ValidatedChangeSet {
  const changeSet = OntologyChangeSetSchema.parse(input);
  const changes = changeSet.changes.map((entry) => ({
    ...entry,
    command: AuthoringCommandV2Schema.parse(entry.command),
  }));
  return { ...changeSet, changes };
}
