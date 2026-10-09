import type { Ontology } from "@trybacked/core";

export function ontologyHasDocumentArchiveEntity(ontology: Ontology): boolean {
  return ontology.objects.some((object) => object.id.toLowerCase().includes("document"));
}
