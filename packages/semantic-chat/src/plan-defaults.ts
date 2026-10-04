import type { ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";

/** Above this property count, row queries without select would scan every column. */
const WIDE_OBJECT_PROPERTY_THRESHOLD = 20;

const DEFAULT_SELECT_CAP = 10;

/**
 * Semantic chat: avoid SELECT * on wide warehouse objects when the LLM omits select.
 * Picks keys and typed attributes from the published ontology only.
 */
export function applySemanticChatSelectDefault(
  ontology: Ontology,
  query: ObjectQuery,
): ObjectQuery {
  if (query.mode === "count") {
    return query;
  }
  if (query.select !== undefined && query.select.length > 0) {
    return query;
  }
  if (query.groupBy !== undefined && query.groupBy.length > 0) {
    return query;
  }

  const object = ontology.objects.find((candidate) => candidate.id === query.objectId);
  if (object === undefined) {
    return query;
  }

  const display = object.semantics?.displayProperties;
  if (display !== undefined && display.length > 0) {
    return { ...query, select: display.slice(0, DEFAULT_SELECT_CAP) };
  }

  if (object.properties.length <= WIDE_OBJECT_PROPERTY_THRESHOLD) {
    return query;
  }

  const selected: string[] = [];
  for (const property of object.properties) {
    if (property.role === "primary_key") {
      selected.push(property.id);
    }
  }
  for (const property of object.properties) {
    if (selected.length >= DEFAULT_SELECT_CAP) {
      break;
    }
    if (selected.includes(property.id)) {
      continue;
    }
    if (
      property.type === "string" ||
      property.type === "date" ||
      property.type === "datetime" ||
      property.type === "integer" ||
      property.type === "float" ||
      property.type === "decimal"
    ) {
      selected.push(property.id);
    }
  }

  if (selected.length === 0) {
    return query;
  }

  return { ...query, select: selected };
}
