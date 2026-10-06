import type { AuthoringCommand, OntologyPackSummary, SemanticCatalog } from "@trybacked/core";
import { AuthoringCommandError } from "../apply-command.js";
import { covPackCommands } from "./cov.js";

export const SHARED_SEMANTIC_CATALOGS: readonly SemanticCatalog[] = [];

export const ONTOLOGY_PACKS: OntologyPackSummary[] = [
  {
    id: "cov",
    name: "COV-AP_IT + Person",
    description:
      "Organizzazione, PublicOrganization, PrivateOrganization, SupportUnit (schema.gov.it COV) e Person",
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
