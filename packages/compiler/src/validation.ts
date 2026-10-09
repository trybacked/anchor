import type { OntologyObject } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import { allowedValuesFrom, propertySuggestionEntries, suggestClosest } from "./suggest.js";

export function assertKnownProperty(object: OntologyObject, propertyId: string): void {
  if (object.properties.some((property) => property.id === propertyId)) {
    return;
  }
  const entries = propertySuggestionEntries(object);
  throw new ObjectQueryCompileError(
    "unknown_property",
    `Property "${propertyId}" is not part of object "${object.id}".`,
    {
      path: "propertyId",
      invalidValue: propertyId,
      allowed: allowedValuesFrom(entries),
      suggestions: suggestClosest(propertyId, entries),
    },
  );
}
