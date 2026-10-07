export {
  LEGACY_DOCUMENT_OBJECT_IDS,
  LEGACY_DOCUMENT_ARCHIVE_BINDING,
  LEGACY_PIPELINE_INFRA_DATASET_TABLES,
  LEGACY_PIPELINE_MATERIALIZED_DATASET_TABLES,
  LEGACY_DOC_TYPE_TABLE_PREFIX,
  discoveryTablesFromBinding,
  documentTablesFromBinding,
  isLegacyDocumentTypeMaterializedTable,
  isLegacyPipelineInfraDatasetTable,
  legacyDocumentTables,
} from "./binding.js";