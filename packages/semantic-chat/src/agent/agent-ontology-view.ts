import type {
  EntitySemantics,
  Ontology,
  OntologyObject,
  OntologyProperty,
  PropertySemantics,
} from "@trybacked/core";
export type AgentPropertyView = {
  id: string;
  name: string;
  type: string;
  role?: string | undefined;
  semantics?: PropertySemantics | undefined;
};
export type AgentRelationshipView = {
  id: string;
  with: string;
  from: string;
  to: string;
  cardinality: string;
};
export type AgentObjectView = {
  id: string;
  name: string;
  description?: string | undefined;
  semantics?: EntitySemantics | undefined;
  properties: AgentPropertyView[];
  relationships: AgentRelationshipView[];
};
function toPropertyView(property: OntologyProperty): AgentPropertyView {
  return {
    id: property.id,
    name: property.name,
    type: property.type,
    ...(property.role !== undefined ? { role: property.role } : {}),
    ...(property.semantics !== undefined ? { semantics: property.semantics } : {}),
  };
}
function relationshipsOf(ontology: Ontology, objectId: string): AgentRelationshipView[] {
  return ontology.relationships
    .filter((relation) => relation.fromObjectId === objectId || relation.toObjectId === objectId)
    .map((relation) => ({
      id: relation.id,
      with: relation.fromObjectId === objectId ? relation.toObjectId : relation.fromObjectId,
      from: `${relation.fromObjectId}.${relation.fromPropertyId ?? "?"}`,
      to: `${relation.toObjectId}.${relation.toPropertyId ?? "?"}`,
      cardinality: relation.cardinality,
    }));
}
export function toAgentObjectView(ontology: Ontology, object: OntologyObject): AgentObjectView {
  return {
    id: object.id,
    name: object.name,
    ...(object.description !== undefined ? { description: object.description } : {}),
    ...(object.semantics !== undefined ? { semantics: object.semantics } : {}),
    properties: object.properties.map(toPropertyView),
    relationships: relationshipsOf(ontology, object.id),
  };
}
function describeProperty(property: OntologyProperty): string {
  const semantics = property.semantics ?? {};
  const traits = [property.type, semantics.semanticRole, semantics.valueFormat].filter(
    (trait): trait is string => trait !== undefined,
  );
  const synonyms = semantics.synonyms?.length ? ` Synonyms: ${semantics.synonyms.join(", ")}.` : "";
  return `- ${property.id} (${traits.join(", ")})${semantics.description ? `: ${semantics.description}` : ""}${synonyms}`;
}
function describeObject(ontology: Ontology, object: OntologyObject): string {
  const annotated = object.properties.filter((property) => property.semantics !== undefined);
  const others = object.properties.filter((property) => property.semantics === undefined);
  const relationships = relationshipsOf(ontology, object.id);
  return [
    `### ${object.id} (${object.name})`,
    object.description,
    object.semantics?.defaultTimeDimension !== undefined
      ? `Default time dimension: ${object.semantics.defaultTimeDimension}`
      : undefined,
    object.semantics?.synonyms?.length
      ? `Also called: ${object.semantics.synonyms.join(", ")}`
      : undefined,
    annotated.length > 0
      ? ["Annotated properties:", ...annotated.map(describeProperty)].join("\n")
      : undefined,
    others.length > 0
      ? `Other properties: ${others.map((property) => `${property.id} (${property.type})`).join(", ")}`
      : undefined,
    relationships.length > 0
      ? [
          `Relationships of ${object.id} (to constrain it by a related object, keep objectId "${object.id}" and add joins plus filters entries carrying the related objectId):`,
          ...relationships.map(
            (relation) =>
              `- ${relation.id} -> ${relation.with} (${relation.from} = ${relation.to}, ${relation.cardinality})`,
          ),
        ].join("\n")
      : undefined,
  ]
    .filter((line): line is string => line !== undefined && line.length > 0)
    .join("\n");
}
export function renderSemanticContext(ontology: Ontology, objectIds: readonly string[]): string {
  return ontology.objects
    .filter((object) => objectIds.includes(object.id))
    .map((object) => describeObject(ontology, object))
    .join("\n\n");
}
