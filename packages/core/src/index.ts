/** Shared schemas and types for model.yaml and .backed/ artifacts */

export const PACKAGE_NAME = "@backed/core" as const;

export { MODEL_FORMAT_VERSION, LOW_CONFIDENCE_THRESHOLD, DEFAULT_REVIEW_CONFIDENCE_THRESHOLD } from "./constants.js";

export {
  PROFILE_TOP_VALUES_LIMIT,
  PROFILE_PATTERN_SAMPLE_SIZE,
  PROFILE_PATTERN_MATCH_THRESHOLD,
  PROFILE_FK_OVERLAP_THRESHOLD,
  PROFILE_FK_SAMPLE_SIZE,
  PROFILE_FK_CANDIDATES_PER_COLUMN,
  ForeignKeyCandidateSchema,
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
  ForeignKeyCandidate,
  TopValue,
  ColumnProfile,
  TableProfile,
  ProfileReport,
} from "./profile.js";

export {
  ConfidenceSchema,
  ProvenanceSchema,
  SemanticTypeSchema,
  PropertyRoleSchema,
  ElementStatusSchema,
  PropertySchema,
  EntitySchema,
  CardinalitySchema,
  RelationSchema,
  RuleSchema,
  ModelMetadataSchema,
  SemanticModelSchema,
} from "./model.js";
export type {
  Confidence,
  Provenance,
  SemanticType,
  PropertyRole,
  ElementStatus,
  Property,
  Entity,
  Cardinality,
  Relation,
  Rule,
  ModelMetadata,
  SemanticModel,
} from "./model.js";

export {
  DoubtSchema,
  EvidenceTableSchema,
  ReviewQuestionKindSchema,
  ReviewQuestionSchema,
  ProposalUsageSchema,
  ProposalSchema,
} from "./proposal.js";
export type {
  Doubt,
  EvidenceTable,
  ReviewQuestionKind,
  ReviewQuestion,
  ProposalUsage,
  Proposal,
} from "./proposal.js";

export { ReviewDecisionSchema, ReviewAnswerSchema, ReviewSchema, applyReview } from "./review.js";
export type { ReviewDecision, ReviewAnswer, Review } from "./review.js";

export { DiffChangeKindSchema, DiffChangeSchema, ModelDiffSchema } from "./diff.js";
export type { DiffChangeKind, DiffChange, ModelDiff } from "./diff.js";

export {
  BACKED_DIR_NAME,
  CONFIG_FILE_NAME,
  RUNS_DIR_NAME,
  MODEL_FILE_NAME,
  DATA_FILE_NAME,
  RUN_ARTIFACTS,
  WorkspaceConfigSchema,
  workspacePaths,
  createRunId,
} from "./workspace.js";
export type { RunArtifactName, WorkspaceConfig, WorkspacePaths } from "./workspace.js";

export {
  DEFAULT_ROW_LIMIT,
  MAX_ROW_LIMIT,
} from "./data-query.js";
export type { RowFilter, EntityRowRequest, RowReader } from "./data-query.js";

export {
  initWorkspace,
  readWorkspaceConfig,
  writeRunArtifact,
  readRunArtifact,
  hasRunArtifact,
  listRunIds,
  serializeModelYaml,
  parseModelYaml,
  writeModelYaml,
  readModelYaml,
} from "./artifacts.js";
