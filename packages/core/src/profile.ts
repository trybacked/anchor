/**
 * Zod schema for profile.json — statistical evidence produced by @backed/profile.
 * Lives in core because it is a shared pipeline artifact (profile → semantic).
 */

import { z } from "zod";

export const PROFILE_TOP_VALUES_LIMIT = 10;
export const PROFILE_PATTERN_SAMPLE_SIZE = 200;
export const PROFILE_PATTERN_MATCH_THRESHOLD = 0.8;

/** Minimum value overlap to record a deterministic FK candidate (0..1). */
export const PROFILE_FK_OVERLAP_THRESHOLD = 0.7;

/** Distinct values sampled per column when estimating cross-table overlap. */
export const PROFILE_FK_SAMPLE_SIZE = 200;

/** Max FK candidates kept per column (best overlap first). */
export const PROFILE_FK_CANDIDATES_PER_COLUMN = 3;

export const ForeignKeyCandidateSchema = z.object({
  targetTable: z.string().min(1),
  targetColumn: z.string().min(1),
  overlapRatio: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const DetectedPatternKindSchema = z.enum([
  "date",
  "email",
  "amount",
  "vat_number",
  "fiscal_code",
]);

export const DetectedPatternSchema = z.object({
  kind: DetectedPatternKindSchema,
  // Share of sampled values matching the pattern (0..1).
  matchRatio: z.number().min(0).max(1),
});

export const TopValueSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});

export const ColumnProfileSchema = z.object({
  name: z.string().min(1),
  sqlType: z.string().min(1),
  nullCount: z.number().int().nonnegative(),
  nullRatio: z.number().min(0).max(1),
  distinctCount: z.number().int().nonnegative(),
  min: z.string().nullable(),
  max: z.string().nullable(),
  topValues: z.array(TopValueSchema).max(PROFILE_TOP_VALUES_LIMIT),
  patterns: z.array(DetectedPatternSchema),
  foreignKeyCandidates: z.array(ForeignKeyCandidateSchema).default([]),
});

export const TableProfileSchema = z.object({
  table: z.string().min(1),
  sourceFile: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  columns: z.array(ColumnProfileSchema),
});

// profile.json is an array of table profiles, one per registered dataset.
export const ProfileReportSchema = z.array(TableProfileSchema);

export type DetectedPatternKind = z.infer<typeof DetectedPatternKindSchema>;
export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;
export type ForeignKeyCandidate = z.infer<typeof ForeignKeyCandidateSchema>;
export type TopValue = z.infer<typeof TopValueSchema>;
export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;
export type TableProfile = z.infer<typeof TableProfileSchema>;
export type ProfileReport = z.infer<typeof ProfileReportSchema>;
