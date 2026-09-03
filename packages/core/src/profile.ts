/**
 * Schema Zod di profile.json — l'evidenza statistica prodotta da @backed/profile.
 * Vive in core perché è un artefatto condiviso della pipeline (profile → semantic).
 */

import { z } from "zod";

export const PROFILE_TOP_VALUES_LIMIT = 10;
export const PROFILE_PATTERN_SAMPLE_SIZE = 200;
export const PROFILE_PATTERN_MATCH_THRESHOLD = 0.8;

export const DetectedPatternKindSchema = z.enum([
  "date",
  "email",
  "amount",
  "vat_number",
  "fiscal_code",
]);

export const DetectedPatternSchema = z.object({
  kind: DetectedPatternKindSchema,
  // Quota di valori campionati che corrispondono al pattern (0..1).
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
});

export const TableProfileSchema = z.object({
  table: z.string().min(1),
  sourceFile: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  columns: z.array(ColumnProfileSchema),
});

// profile.json è un array di profili tabella, uno per dataset registrato.
export const ProfileReportSchema = z.array(TableProfileSchema);

export type DetectedPatternKind = z.infer<typeof DetectedPatternKindSchema>;
export type DetectedPattern = z.infer<typeof DetectedPatternSchema>;
export type TopValue = z.infer<typeof TopValueSchema>;
export type ColumnProfile = z.infer<typeof ColumnProfileSchema>;
export type TableProfile = z.infer<typeof TableProfileSchema>;
export type ProfileReport = z.infer<typeof ProfileReportSchema>;
