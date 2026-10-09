import { z } from "zod";

export const ONTOLOGY_RELATIONSHIP_CARDINALITIES = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
] as const;

export type OntologyRelationshipCardinality = (typeof ONTOLOGY_RELATIONSHIP_CARDINALITIES)[number];

export const OntologyRelationshipCardinalitySchema = z.enum(ONTOLOGY_RELATIONSHIP_CARDINALITIES);

export const CardinalitySchema = OntologyRelationshipCardinalitySchema;

export type Cardinality = z.infer<typeof CardinalitySchema>;

const cardinalitySet = new Set<string>(ONTOLOGY_RELATIONSHIP_CARDINALITIES);

export function parseRelationshipCardinality(value: string): Cardinality {
  if (cardinalitySet.has(value)) {
    return value as Cardinality;
  }
  return "one_to_many";
}
