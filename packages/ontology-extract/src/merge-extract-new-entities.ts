import type { Entity, Property, Proposal } from "@trybacked/core";
import type { OntologyExtractOutput } from "./extract-output.js";

const DEFAULT_LLM_ENTITY_CONFIDENCE = 0.72;

function humanizeIdentifier(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function propertyFromExtractPatch(
  patch: NonNullable<OntologyExtractOutput["entities"][number]["properties"]>[number],
  table: string,
): Property {
  return {
    name: patch.name ?? humanizeIdentifier(patch.columnName),
    columnName: patch.columnName,
    semanticType: patch.semanticType ?? "text",
    role: patch.role ?? "attribute",
    nullable: true,
    confidence: patch.confidence ?? DEFAULT_LLM_ENTITY_CONFIDENCE,
    provenance: {
      table,
      column: patch.columnName,
      evidence: "llm_file_extraction",
      method: "llm" as const,
    },
    ...(patch.semantics !== undefined ? { semantics: patch.semantics } : {}),
  };
}

export function entityFromExtractPatch(
  patch: OntologyExtractOutput["entities"][number],
): Entity {
  const table = patch.id;
  const properties =
    patch.properties !== undefined && patch.properties.length > 0
      ? patch.properties.map((entry) => propertyFromExtractPatch(entry, table))
      : [
          {
            name: "Identifier",
            columnName: "normalized_name",
            semanticType: "identifier" as const,
            role: "primary_key" as const,
            nullable: false,
            confidence: DEFAULT_LLM_ENTITY_CONFIDENCE,
            provenance: {
              table,
              column: "normalized_name",
              evidence: "llm_file_extraction",
              method: "llm" as const,
            },
          },
        ];
  return {
    id: patch.id,
    name: patch.name ?? humanizeIdentifier(patch.id),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    sourceTable: table,
    status: "proposed",
    confidence: patch.confidence ?? DEFAULT_LLM_ENTITY_CONFIDENCE,
    properties,
    provenance: {
      table,
      column: properties[0]?.columnName ?? patch.id,
      evidence: "llm_file_extraction",
      method: "llm" as const,
    },
    ...(patch.semantics !== undefined ? { semantics: patch.semantics } : {}),
  };
}

export function appendNewExtractEntities(
  baseline: Proposal,
  extract: OntologyExtractOutput,
): Entity[] {
  const known = new Set(baseline.entities.map((entity) => entity.id));
  const added: Entity[] = [];
  for (const patch of extract.entities) {
    if (known.has(patch.id)) {
      continue;
    }
    known.add(patch.id);
    added.push(entityFromExtractPatch(patch));
  }
  return [...baseline.entities, ...added];
}
