import { SEMANTIC_CHAT_MAX_ROW_LIMIT, type Ontology } from "@trybacked/core";
import { z } from "zod";
import type { AnchorService } from "../anchor-service.js";
import { getPropertyValues } from "./get-property-values.js";
import { DEFAULT_SCHEMA_SEARCH_HITS, MAX_SCHEMA_SEARCH_HITS } from "./limits.js";
import { searchOntologySchema } from "./search-schema.js";
export const SearchSchemaInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(MAX_SCHEMA_SEARCH_HITS).optional(),
});
export const GetPropertyValuesInputSchema = z.object({
  objectId: z.string().min(1),
  propertyId: z.string().min(1),
  prefix: z.string().optional(),
  limit: z.number().int().positive().max(SEMANTIC_CHAT_MAX_ROW_LIMIT).optional(),
});
export type ReadOnlyToolHandlers = {
  search_schema: (input: z.infer<typeof SearchSchemaInputSchema>) => {
    hits: ReturnType<typeof searchOntologySchema>;
  };
  get_entity: (input: { objectId: string }) => {
    object: NonNullable<ReturnType<typeof getOntologyObject>>;
  };
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
      hits: searchOntologySchema(ontology, input.query, input.limit ?? DEFAULT_SCHEMA_SEARCH_HITS),
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
