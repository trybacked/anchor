import type { Ontology } from "@trybacked/core";

/** True when the published model includes a document-archive entity (not warehouse-only). */
export function ontologyHasDocumentArchiveEntity(ontology: Ontology): boolean {
  return ontology.objects.some((object) => object.id.toLowerCase().includes("document"));
}
