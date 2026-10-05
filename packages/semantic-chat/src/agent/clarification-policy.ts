import type { Ontology } from "@trybacked/core";
import { propertyMentioned } from "./term-matching.js";
export type PropertyAmbiguity = {
  objectId: string;
  propertyIds: string[];
};
export type ClarificationVerdict =
  | {
      accepted: true;
    }
  | {
      accepted: false;
      reason: string;
    };
const ACCEPTED: ClarificationVerdict = { accepted: true };
function rejected(reason: string): ClarificationVerdict {
  return { accepted: false, reason };
}
export function evaluateClarification(
  ontology: Ontology,
  question: string,
  ambiguity: PropertyAmbiguity | undefined,
): ClarificationVerdict {
  if (ambiguity === undefined) return ACCEPTED;
  const object = ontology.objects.find((candidate) => candidate.id === ambiguity.objectId);
  if (object === undefined) {
    return rejected(`Unknown object "${ambiguity.objectId}"; use an object id from the schema.`);
  }
  const candidates = ambiguity.propertyIds.map((propertyId) => ({
    propertyId,
    property: object.properties.find((property) => property.id === propertyId),
  }));
  const unknown = candidates.filter((candidate) => candidate.property === undefined);
  if (unknown.length > 0) {
    return rejected(
      `Unknown properties on ${object.id}: ${unknown.map((candidate) => candidate.propertyId).join(", ")}.`,
    );
  }
  const mentioned = candidates.filter(
    (candidate) =>
      candidate.property !== undefined && propertyMentioned(question, candidate.property),
  );
  const [onlyMentioned] = mentioned;
  if (mentioned.length === 1 && onlyMentioned !== undefined) {
    return rejected(
      `The question already refers to ${object.id}.${onlyMentioned.propertyId}; query with it instead of asking.`,
    );
  }
  const defaultTime = object.semantics?.defaultTimeDimension;
  if (
    mentioned.length === 0 &&
    defaultTime !== undefined &&
    ambiguity.propertyIds.includes(defaultTime)
  ) {
    return rejected(
      `${object.id}.${defaultTime} is the default time dimension; query with it and state that choice in assumptions.`,
    );
  }
  return ACCEPTED;
}
