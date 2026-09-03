/** Schema e tipi condivisi per modello.yaml e artefatti .backed/ */

export const PACKAGE_NAME = "@backed/core" as const;

export {
  PROFILE_TOP_VALUES_LIMIT,
  PROFILE_PATTERN_SAMPLE_SIZE,
  PROFILE_PATTERN_MATCH_THRESHOLD,
  DetectedPatternKindSchema,
  DetectedPatternSchema,
  TopValueSchema,
  ColumnProfileSchema,
  TableProfileSchema,
  ProfileReportSchema,
} from "./profile.js";
export type {
  DetectedPatternKind,
  DetectedPattern,
  TopValue,
  ColumnProfile,
  TableProfile,
  ProfileReport,
} from "./profile.js";
