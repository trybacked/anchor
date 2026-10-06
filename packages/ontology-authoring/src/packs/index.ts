import type { AuthoringCommand, OntologyPackSummary, SemanticCatalog } from "@trybacked/core";
import { AuthoringCommandError } from "../apply-command.js";
import { docsPackCommands } from "./docs.js";

export const SHARED_SEMANTIC_CATALOGS: readonly SemanticCatalog[] = [];

export const ONTOLOGY_PACKS: OntologyPackSummary[] = [
  {
    id: "docs",
    name: "Document archive",
    description:
      "document, document_element, person, and document_has_elements on tenant docs schema",
  },
];

export function commandsForPack(packId: string, catalog: string): AuthoringCommand[] {
  switch (packId) {
    case "docs":
      return docsPackCommands(catalog);
    default:
      throw new AuthoringCommandError(`Unknown pack "${packId}"`);
  }
}

export function listPacks(): OntologyPackSummary[] {
  return ONTOLOGY_PACKS;
}
