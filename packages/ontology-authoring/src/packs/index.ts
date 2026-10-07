import type { SemanticCatalog } from "@trybacked/core";

export type OntologyPackSummary = {
  id: string;
  name: string;
  description: string;
};

/**
 * Packs are data, not code (Plan Fase 7): templates are JSON lists of
 * AuthoringCommands stored in the control plane. No domain packs ship here.
 */
export const ONTOLOGY_PACKS: OntologyPackSummary[] = [];

/** Shared semantic catalogs are data supplied by deployment config, not code. */
export const SHARED_SEMANTIC_CATALOGS: readonly SemanticCatalog[] = [];

export function listPacks(): OntologyPackSummary[] {
  return ONTOLOGY_PACKS;
}
