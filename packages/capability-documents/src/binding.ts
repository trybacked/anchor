import {
  DocumentArchiveBindingSchema,
  type DocumentArchiveBinding,
  type DocumentObjectIds,
  type DocumentTablesSpec,
} from "@trybacked/core";

export const LEGACY_DOCUMENT_ARCHIVE_BINDING: DocumentArchiveBinding =
  DocumentArchiveBindingSchema.parse({
    datasets: {
      documents: "documents",
      documentElements: "document_elements",
      documentChunks: "document_chunks",
      documentLines: "document_lines",
      documentMentions: "document_mentions",
      documentEntities: "document_entities",
      documentFacts: "document_facts",
      documentPages: "document_pages",
      entityProfiles: "entity_profiles",
    },
    columns: {
      documentId: "document_id",
      path: "source_file",
      content: "content",
      page: "page_number",
      elementType: "element_type",
    },
  });

export const LEGACY_DOCUMENT_OBJECT_IDS: DocumentObjectIds = {
  document: "document",
  documentElement: "document_element",
};

export function documentTablesFromBinding(binding: DocumentArchiveBinding): DocumentTablesSpec {
  return {
    documents: binding.datasets.documents,
    documentElements: binding.datasets.documentElements,
    documentEntities: binding.datasets.documentEntities,
    entityProfiles: binding.datasets.entityProfiles,
  };
}

export function legacyDocumentTables(): DocumentTablesSpec {
  return documentTablesFromBinding(LEGACY_DOCUMENT_ARCHIVE_BINDING);
}

export function discoveryTablesFromBinding(binding: DocumentArchiveBinding): string[] {
  return [
    binding.datasets.documents,
    binding.datasets.documentPages,
    binding.datasets.documentElements,
    binding.datasets.documentEntities,
    binding.datasets.entityProfiles,
  ];
}

export const LEGACY_PIPELINE_INFRA_DATASET_TABLES: readonly string[] = [
  "document_lines",
  "document_chunks",
  "document_entities",
  "document_mentions",
  "document_facts",
  "entity_profiles",
];

export const LEGACY_PIPELINE_MATERIALIZED_DATASET_TABLES: readonly string[] = [
  "document_entities",
  "document_mentions",
  "document_facts",
  "entity_profiles",
];

const PIPELINE_INFRA_SET = new Set<string>(LEGACY_PIPELINE_INFRA_DATASET_TABLES);

export const LEGACY_DOC_TYPE_TABLE_PREFIX = "doc_";

export function isLegacyDocumentTypeMaterializedTable(tableName: string): boolean {
  return tableName.startsWith(LEGACY_DOC_TYPE_TABLE_PREFIX);
}

export function isLegacyPipelineInfraDatasetTable(tableName: string): boolean {
  return isLegacyDocumentTypeMaterializedTable(tableName) || PIPELINE_INFRA_SET.has(tableName);
}
