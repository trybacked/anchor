import type { Ontology, OntologyObject, OntologyProperty } from "./ontology/spec.js";
import type { EntityDisplayLabel } from "./semantics.js";

export type EntityLabelForm = "singular" | "plural";

function language(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0] ?? locale.toLowerCase();
}

function entityDisplayLabel(
  object: OntologyObject | undefined,
  locale: string,
): EntityDisplayLabel | undefined {
  return object?.semantics?.labels?.[language(locale)];
}

export function findObject(ontology: Ontology, objectId: string): OntologyObject | undefined {
  return ontology.objects.find((object) => object.id === objectId);
}

export function findProperty(
  ontology: Ontology,
  objectId: string,
  propertyId: string,
): OntologyProperty | undefined {
  return findObject(ontology, objectId)?.properties.find((property) => property.id === propertyId);
}

export function objectLabel(
  ontology: Ontology,
  objectId: string,
  locale: string,
  form: EntityLabelForm = "plural",
): string {
  const object = findObject(ontology, objectId);
  const label = entityDisplayLabel(object, locale);
  return label?.[form] ?? object?.name ?? objectId;
}

export function propertyLabel(
  ontology: Ontology,
  objectId: string,
  propertyId: string,
  locale: string,
): string {
  const property = findProperty(ontology, objectId, propertyId);
  return property?.semantics?.labels?.[language(locale)] ?? property?.name ?? propertyId;
}
