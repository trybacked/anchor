/** Foundry-style document archive object types (operational, not thematic Wikipedia types). */

export const FOUNDRY_DOCUMENT_OBJECT_TYPE_IDS = [
  "document",
  "organization",
  "person",
  "legal_instrument",
  "topic",
  "military_asset",
  "document_topic_mention",
  "document_organization_mention",
  "document_person_mention",
  "document_legal_instrument_mention",
  "person_organization_affiliation",
] as const;

export type FoundryDocumentObjectTypeId = (typeof FOUNDRY_DOCUMENT_OBJECT_TYPE_IDS)[number];

export const FOUNDRY_EXTRACT_OBJECT_TYPE_IDS = [
  "document",
  "organization",
  "person",
  "legal_instrument",
  "topic",
  "military_asset",
] as const;

export type FoundryExtractObjectTypeId = (typeof FOUNDRY_EXTRACT_OBJECT_TYPE_IDS)[number];

export function docsQualifiedTable(catalog: string, table: string): string {
  return `${catalog}.docs.${table}`;
}

export function defaultFoundryCatalog(ontologyId: string): string {
  const trimmed = ontologyId.trim();
  if (trimmed.length === 0) {
    return "backed_default";
  }
  return trimmed.startsWith("backed_") ? trimmed : `backed_${trimmed}`;
}
