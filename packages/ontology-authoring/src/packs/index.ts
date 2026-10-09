import type { SemanticCatalog } from "@trybacked/core";

export type OntologyPackSummary = {
  id: string;
  name: string;
  description: string;
};

export const ONTOLOGY_PACKS: OntologyPackSummary[] = [];

export const SHARED_SEMANTIC_CATALOGS: readonly SemanticCatalog[] = [];

export function listPacks(): OntologyPackSummary[] {
  return ONTOLOGY_PACKS;
}
