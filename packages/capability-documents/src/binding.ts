import {
  DocumentArchiveBindingSchema,
  type DocumentArchiveBinding,
  type DocumentObjectIds,
  type DocumentTablesSpec,
} from "@trybacked/core";

/**
 * Legacy document-archive binding (Plan Phase 4).
 *
 * The historical `docs` layout — table names and column names that used to be
 * hardcoded in `packages/core/src/tables.ts` — is now just the *default*
 * binding shipped with the documents capability. Tenants override it via their
 * `tenant_sources.binding`; nothing in the kernel or apps knows these names.
 */

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

/** Legacy ontology object ids that behave as documents. */
export const LEGACY_DOCUMENT_OBJECT_IDS: DocumentObjectIds = {
  document: "document",
  documentElement: "document_element",
};

/** Dataset subset consumed by the runtime readers/probe. */
export function documentTablesFromBinding(binding: DocumentArchiveBinding): DocumentTablesSpec {
  return {
    documents: binding.datasets.documents,
    documentElements: binding.datasets.documentElements,
    documentEntities: binding.datasets.documentEntities,
    entityProfiles: binding.datasets.entityProfiles,
  };
}

/** Convenience accessor for the legacy layout, used until tenants register sources. */
export function legacyDocumentTables(): DocumentTablesSpec {
  return documentTablesFromBinding(LEGACY_DOCUMENT_ARCHIVE_BINDING);
}

/** Discovery tables proposed for ontology discovery after document ingest. */
export function discoveryTablesFromBinding(binding: DocumentArchiveBinding): string[] {
  return [
    binding.datasets.documents,
    binding.datasets.documentPages,
    binding.datasets.documentElements,
    binding.datasets.documentEntities,
    binding.datasets.entityProfiles,
  ];
}

/** Infrastructure datasets materialized by the documents pipeline (legacy layout). */
export const LEGACY_PIPELINE_INFRA_DATASET_TABLES: readonly string[] = [
  "document_lines",
  "document_chunks",
  "document_entities",
  "document_mentions",
  "document_facts",
  "entity_profiles",
];

/** Materialized datasets exposed in the ontology (legacy layout). */
export const LEGACY_PIPELINE_MATERIALIZED_DATASET_TABLES: readonly string[] = [
  "document_entities",
  "document_mentions",
  "document_facts",
  "entity_profiles",
];

const PIPELINE_INFRA_SET = new Set<string>(LEGACY_PIPELINE_INFRA_DATASET_TABLES);

/** Per-tenant document-type materializations use the legacy `doc_` prefix. */
export const LEGACY_DOC_TYPE_TABLE_PREFIX = "doc_";

export function isLegacyDocumentTypeMaterializedTable(tableName: string): boolean {
  return tableName.startsWith(LEGACY_DOC_TYPE_TABLE_PREFIX);
}

export function isLegacyPipelineInfraDatasetTable(tableName: string): boolean {
  return isLegacyDocumentTypeMaterializedTable(tableName) || PIPELINE_INFRA_SET.has(tableName);
}
