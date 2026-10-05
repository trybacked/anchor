import { z } from "zod";
import type { Ontology, OntologyObject, OntologyProperty } from "./ontology/spec.js";
import {
  EntitySemanticsSchema,
  PropertySemanticsSchema,
  VerifiedExampleSchema,
  type EntitySemantics,
  type GlossaryTerm,
  type VerifiedExample,
} from "./semantics.js";
export const DatasetSemanticsSchema = z.object({
  entity: EntitySemanticsSchema.optional(),
  properties: z.record(z.string().min(1), PropertySemanticsSchema).default({}),
});
export const CatalogGlossaryTermSchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  definition: z.string().min(1),
  datasetId: z.string().min(1).optional(),
  propertyId: z.string().min(1).optional(),
});
export const SemanticCatalogSchema = z.object({
  id: z.string().min(1),
  datasets: z.record(z.string().min(1), DatasetSemanticsSchema),
  glossary: z.array(CatalogGlossaryTermSchema).default([]),
  examples: z.array(VerifiedExampleSchema).default([]),
});
export type DatasetSemantics = z.infer<typeof DatasetSemanticsSchema>;
export type CatalogGlossaryTerm = z.infer<typeof CatalogGlossaryTermSchema>;
export type SemanticCatalog = z.infer<typeof SemanticCatalogSchema>;
function withDefaults<T extends object>(
  defaults: T | undefined,
  own: T | undefined,
): T | undefined {
  if (defaults === undefined) return own;
  if (own === undefined) return defaults;
  return { ...defaults, ...own };
}
function findDatasetSemantics(
  catalogs: readonly SemanticCatalog[],
  datasetId: string | undefined,
): DatasetSemantics | undefined {
  if (datasetId === undefined) return undefined;
  return catalogs.find((catalog) => catalog.datasets[datasetId] !== undefined)?.datasets[datasetId];
}
function enrichProperty(property: OntologyProperty, dataset: DatasetSemantics): OntologyProperty {
  const semantics = withDefaults(dataset.properties[property.id], property.semantics);
  return semantics === undefined ? property : { ...property, semantics };
}
/**
 * Catalogs describe a dataset family; a tenant may expose only part of it.
 * Property references that do not exist on this object are dropped so hints
 * never leak into prompts or query defaults. Glossary terms are pruned the
 * same way in resolveGlossary.
 */
function pruneEntitySemantics(semantics: EntitySemantics, object: OntologyObject): EntitySemantics {
  const known = new Set(object.properties.map((property) => property.id));
  const { displayProperties, defaultTimeDimension, ...rest } = semantics;
  const keptDisplay = displayProperties?.filter((id) => known.has(id));
  const keptTime =
    defaultTimeDimension !== undefined && known.has(defaultTimeDimension)
      ? defaultTimeDimension
      : undefined;
  return {
    ...rest,
    ...(keptDisplay !== undefined ? { displayProperties: keptDisplay } : {}),
    ...(keptTime !== undefined ? { defaultTimeDimension: keptTime } : {}),
  };
}
function enrichObject(
  object: OntologyObject,
  catalogs: readonly SemanticCatalog[],
): OntologyObject {
  const dataset = findDatasetSemantics(catalogs, object.sourceDatasetId);
  if (dataset === undefined) return object;
  const semantics = withDefaults(dataset.entity, object.semantics);
  return {
    ...object,
    ...(semantics !== undefined ? { semantics: pruneEntitySemantics(semantics, object) } : {}),
    properties: object.properties.map((property) => enrichProperty(property, dataset)),
  };
}
function resolveGlossary(
  catalogs: readonly SemanticCatalog[],
  objects: readonly OntologyObject[],
): GlossaryTerm[] {
  const objectByDataset = new Map(
    objects.flatMap((object) =>
      object.sourceDatasetId !== undefined ? [[object.sourceDatasetId, object] as const] : [],
    ),
  );
  return catalogs.flatMap((catalog) =>
    catalog.glossary.flatMap((term): GlossaryTerm[] => {
      if (term.datasetId === undefined) {
        return [{ id: term.id, term: term.term, definition: term.definition }];
      }
      const object = objectByDataset.get(term.datasetId);
      if (object === undefined) return [];
      const propertyId = term.propertyId;
      if (
        propertyId !== undefined &&
        !object.properties.some((property) => property.id === propertyId)
      ) {
        return [];
      }
      return [
        {
          id: term.id,
          term: term.term,
          definition: term.definition,
          objectId: object.id,
          ...(propertyId !== undefined ? { propertyId } : {}),
        },
      ];
    }),
  );
}
export function applySemanticCatalogs(
  ontology: Ontology,
  catalogs: readonly SemanticCatalog[],
): Ontology {
  if (catalogs.length === 0) return ontology;
  const objects = ontology.objects.map((object) => enrichObject(object, catalogs));
  const ownGlossary = ontology.semantics?.glossary ?? [];
  const ownIds = new Set(ownGlossary.map((term) => term.id));
  const catalogGlossary = resolveGlossary(catalogs, objects).filter((term) => !ownIds.has(term.id));
  const ownExamples = ontology.semantics?.examples ?? [];
  const exampleIds = new Set(ownExamples.map((example) => example.id));
  const catalogExamples: VerifiedExample[] = catalogs.flatMap((catalog) => {
    const examples = Array.isArray(catalog.examples) ? catalog.examples : [];
    return examples.filter((example) => !exampleIds.has(example.id));
  });
  return {
    ...ontology,
    objects,
    semantics: {
      glossary: [...ownGlossary, ...catalogGlossary],
      examples: [...ownExamples, ...catalogExamples],
    },
  };
}
