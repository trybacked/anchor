/**
 * Zod schema of diff.json — deterministic changes between two runs.
 * The comparison logic lives in @backed/diff; the shared contract lives here.
 */

import { z } from "zod";

export const DiffChangeKindSchema = z.enum([
  "table_added",
  "table_removed",
  "column_added",
  "column_removed",
  "column_type_changed",
  "entity_added",
  "entity_removed",
  "relation_added",
  "relation_removed",
  "relation_broken",
  "rule_added",
  "rule_removed",
]);

export const DiffChangeSchema = z.object({
  kind: DiffChangeKindSchema,
  // Table name, entity id, or relation id the change refers to.
  subject: z.string().min(1),
  // Italian copy describing the change for the user.
  detail: z.string().min(1),
  before: z.string().optional(),
  after: z.string().optional(),
});

export const ModelDiffSchema = z.object({
  fromRunId: z.string().min(1),
  toRunId: z.string().min(1),
  generatedAt: z.string().datetime(),
  changes: z.array(DiffChangeSchema),
});

export type DiffChangeKind = z.infer<typeof DiffChangeKindSchema>;
export type DiffChange = z.infer<typeof DiffChangeSchema>;
export type ModelDiff = z.infer<typeof ModelDiffSchema>;
