import type { AuthoringCommand, OntologyPackSummary } from "@trybacked/core";
import { AuthoringCommandError } from "../apply-command.js";
import { anacPackCommands } from "./anac.js";
import { docsPackCommands } from "./docs.js";

export const ONTOLOGY_PACKS: OntologyPackSummary[] = [
  {
    id: "anac",
    name: "ANAC enrollment",
    description: "contract, organization, and organization_has_contracts on backed.anac.*",
  },
  {
    id: "docs",
    name: "Document archive",
    description:
      "document, document_element, person, and document_has_elements on tenant docs schema",
  },
];

export function commandsForPack(packId: string, catalog: string): AuthoringCommand[] {
  switch (packId) {
    case "anac":
      return anacPackCommands();
    case "docs":
      return docsPackCommands(catalog);
    default:
      throw new AuthoringCommandError(`Unknown pack "${packId}"`);
  }
}

export function listPacks(): OntologyPackSummary[] {
  return ONTOLOGY_PACKS;
}
