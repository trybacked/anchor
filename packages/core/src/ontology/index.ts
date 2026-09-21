export {
  DatasetInspectionSchema,
  DatasetInspectionTableSchema,
  DiscoveryReportSchema,
} from "./discovery-report.js";
export type {
  DatasetInspection,
  DatasetInspectionTable,
  DiscoveryReport,
} from "./discovery-report.js";
export type {
  Dataset,
  DatasetColumn,
  DatasetColumnStatistics,
  DatasetIdentifier,
  DatasetMetadata,
  DatasetProvider,
  DatasetSample,
  DatasetSchema,
  DatasetStatistics,
  SampleOptions,
} from "./dataset-provider.js";
export {
  ONTOLOGY_FORMAT_VERSION,
  OntologyActionHandlerSchema,
  OntologyActionInputSchema,
  OntologyActionSchema,
  OntologyLogicSchema,
  OntologyMetadataSchema,
  OntologyObjectSchema,
  OntologyPropertyRoleSchema,
  OntologyPropertySchema,
  OntologyPropertyTypeSchema,
  OntologyProvenanceSchema,
  OntologyRelationshipCardinalitySchema,
  OntologyRelationshipSchema,
  OntologySchema,
} from "./spec.js";
export type {
  Ontology,
  OntologyAction,
  OntologyLogic,
  OntologyMetadata,
  OntologyObject,
  OntologyProperty,
  OntologyPropertyRole,
  OntologyPropertyType,
  OntologyProvenance,
  OntologyRelationship,
  OntologyRelationshipCardinality,
} from "./spec.js";
export {
  OntologyLifecycleStageSchema,
  canAdvanceLifecycle,
  isGovernedLifecycleStage,
  lifecycleFromModelStatus,
  lifecycleStageIndex,
} from "./lifecycle.js";
export type { OntologyLifecycleStage } from "./lifecycle.js";
export {
  AuditActionSchema,
  AuditActorSchema,
  AuditEventSchema,
  AuditLogSchema,
  EMPTY_AUDIT_LOG,
  buildAutoConfirmAuditEvents,
  buildPublishAuditEvent,
  buildRollbackAuditEvent,
  buildReviewAuditEvents,
  mergeAuditLogs,
} from "./audit.js";
export type { AuditAction, AuditActor, AuditEvent, AuditLog } from "./audit.js";
export { applyReviewLifecycle, markOntologyPublished } from "./apply-review-lifecycle.js";
export type {
  ApplyReviewLifecycleOptions,
  ReviewLifecycleResult,
} from "./apply-review-lifecycle.js";
export { PublicationRecordSchema } from "./publication.js";
export type { PublicationRecord } from "./publication.js";
export {
  loadPublishedOntology,
  publishSemanticModel,
  readPublicationRecord,
  rollbackPublication,
} from "./publish.js";
export {
  OntologyRegistryEntrySchema,
  OntologyRegistrySchema,
  REGISTRY_FILE_NAME,
  archivePublicationRecord,
  listPublicationVersions,
  publicationArchivePath,
  readOntologyRegistry,
  readPublicationByVersion,
  registryPath,
  restorePublicationVersion,
  updateOntologyRegistry,
} from "./registry.js";
export type { OntologyRegistry, OntologyRegistryEntry } from "./registry.js";
export {
  OntologyDiffChangeKindSchema,
  OntologyDiffChangeSchema,
  OntologyDiffSchema,
  diffOntology,
  formatOntologyDiff,
  hasBreakingOntologyChanges,
} from "./diff-ontology.js";
export type { OntologyDiff, OntologyDiffChange, OntologyDiffChangeKind } from "./diff-ontology.js";
export {
  GovernanceElementKindSchema,
  OntologyGovernanceError,
  OntologyGovernancePatchSchema,
  applyOntologyGovernancePatch,
  buildGovernanceAuditEvent,
  isGovernancePatchAction,
} from "./governance-patch.js";
export type {
  GovernanceElementKind,
  GovernancePatchAction,
  OntologyGovernancePatch,
} from "./governance-patch.js";
export { semanticModelToOntology } from "./semantic-model-bridge.js";
export { validateOntology } from "./validate-ontology.js";
export { validateSemanticModel } from "./validate-semantic-model.js";
export type { ValidationIssue, ValidationResult, ValidationSeverity } from "./validation-result.js";
export { mergeValidationResults, validationResult } from "./validation-result.js";
