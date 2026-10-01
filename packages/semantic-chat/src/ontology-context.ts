import type { Ontology } from "@trybacked/core";

export function buildOntologyContextForTranslation(ontology: Ontology): string {
  const objects = ontology.objects.map((object) => ({
    id: object.id,
    name: object.name,
    properties: object.properties.map((property) => ({
      id: property.id,
      type: property.type,
      role: property.role,
    })),
  }));
  const relationships = ontology.relationships.map((relationship) => ({
    id: relationship.id,
    name: relationship.name,
    from: relationship.fromObjectId,
    to: relationship.toObjectId,
    fromPropertyId: relationship.fromPropertyId,
    toPropertyId: relationship.toPropertyId,
  }));
  return JSON.stringify({ objects, relationships }, null, 2);
}
