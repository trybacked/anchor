import type { AuthoringCommand, OntologyPackSummary, SemanticCatalog } from "@trybacked/core";
import { AuthoringCommandError } from "../apply-command.js";
import { covPackCommands } from "./cov.js";

export const SHARED_SEMANTIC_CATALOGS: readonly SemanticCatalog[] = [];

export const ONTOLOGY_PACKS: OntologyPackSummary[] = [
  {
    id: "cov",
    name: "Document ontology",
    description:
      "Foundry-style object types: Organization, Public organization, Private organization, Support unit, Person, and link types.",
  },
];

export function commandsForPack(packId: string, catalog: string): AuthoringCommand[] {
  switch (packId) {
    case "cov":
      return covPackCommands(catalog);
    default:
      throw new AuthoringCommandError(`Unknown pack "${packId}"`);
  }
}

export function listPacks(): OntologyPackSummary[] {
  return ONTOLOGY_PACKS;
}
