import type { Ontology } from "@trybacked/core";
import { z } from "zod";
import type { AnchorService } from "../anchor-service.js";
import { getPropertyValues } from "./get-property-values.js";
import { searchOntologySchema } from "./search-schema.js";

export const SearchSchemaInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(30).optional(),
});

export const GetPropertyValuesInputSchema = z.object({
  objectId: z.string().min(1),
  propertyId: z.string().min(1),
  prefix: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export type ReadOnlyToolHandlers = {
  search_schema: (input: z.infer<typeof SearchSchemaInputSchema>) => { hits: ReturnType<typeof searchOntologySchema> };
  get_entity: (input: { objectId: string }) => { object: NonNullable<ReturnType<typeof getOntologyObject>> };
  get_property_values: (
    input: z.infer<typeof GetPropertyValuesInputSchema>,
  ) => Promise<Awaited<ReturnType<typeof getPropertyValues>>>;
};

function getOntologyObject(ontology: Ontology, objectId: string) {
  return ontology.objects.find((candidate) => candidate.id === objectId);
}

export function createReadOnlyToolHandlers(
  service: AnchorService,
  ontology: Ontology,
): ReadOnlyToolHandlers {
  return {
    search_schema: (input) => ({
      hits: searchOntologySchema(ontology, input.query, input.limit ?? 15),
    }),
    get_entity: (input) => {
      const object = getOntologyObject(ontology, input.objectId);
      if (object === undefined) {
        throw new Error(`Unknown object "${input.objectId}".`);
      }
      return { object };
    },
    get_property_values: (input) => getPropertyValues(service, ontology, input),
  };
}
