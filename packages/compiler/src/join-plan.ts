import type { Ontology, OntologyObject, OntologyRelationship } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import {
  allowedValuesFrom,
  objectSuggestionEntries,
  relationshipSuggestionEntries,
  suggestClosest,
} from "./suggest.js";
export type JoinPlanStep = {
  relationship: OntologyRelationship;
  fromObjectId: string;
  toObjectId: string;
};
export type JoinPlan = {
  rootObjectId: string;
  steps: JoinPlanStep[];
  objectAliases: Map<string, string>;
};
export const MAX_OBJECT_QUERY_JOINS = 5;
const JOIN_RELATIONSHIP_PATH = "joins.relationshipId";
function resolveRelationship(ontology: Ontology, relationshipId: string): OntologyRelationship {
  const relationship = ontology.relationships.find((candidate) => candidate.id === relationshipId);
  if (relationship === undefined) {
    const entries = relationshipSuggestionEntries(ontology);
    throw new ObjectQueryCompileError(
      "unknown_relationship",
      `Relationship "${relationshipId}" is not part of the ontology.`,
      {
        path: JOIN_RELATIONSHIP_PATH,
        invalidValue: relationshipId,
        allowed: allowedValuesFrom(entries),
        suggestions: suggestClosest(relationshipId, entries),
      },
    );
  }
  return relationship;
}
function assertJoinKeys(relationship: OntologyRelationship): {
  fromKey: string;
  toKey: string;
} {
  if (relationship.fromPropertyId === undefined || relationship.toPropertyId === undefined) {
    throw new ObjectQueryCompileError(
      "invalid_join",
      `Relationship "${relationship.id}" has no from/to property mapping for SQL joins.`,
      { path: JOIN_RELATIONSHIP_PATH, invalidValue: relationship.id },
    );
  }
  return { fromKey: relationship.fromPropertyId, toKey: relationship.toPropertyId };
}
export function planObjectQueryJoins(
  ontology: Ontology,
  rootObjectId: string,
  relationshipIds: string[],
): JoinPlan {
  if (relationshipIds.length > MAX_OBJECT_QUERY_JOINS) {
    throw new ObjectQueryCompileError(
      "invalid_join",
      `At most ${String(MAX_OBJECT_QUERY_JOINS)} relationship joins are allowed per query.`,
      { path: "joins" },
    );
  }
  const objectAliases = new Map<string, string>();
  objectAliases.set(rootObjectId, "o0");
  let aliasCounter = 1;
  let currentObjectId = rootObjectId;
  const steps: JoinPlanStep[] = [];
  for (const relationshipId of relationshipIds) {
    const relationship = resolveRelationship(ontology, relationshipId);
    let nextObjectId: string;
    if (relationship.fromObjectId === currentObjectId) {
      nextObjectId = relationship.toObjectId;
    } else if (relationship.toObjectId === currentObjectId) {
      nextObjectId = relationship.fromObjectId;
    } else {
      throw new ObjectQueryCompileError(
        "invalid_join",
        `Relationship "${relationship.id}" does not touch object "${currentObjectId}" in the join chain.`,
        { path: "joins", invalidValue: relationshipId },
      );
    }
    if (!objectAliases.has(nextObjectId)) {
      objectAliases.set(nextObjectId, `o${String(aliasCounter)}`);
      aliasCounter += 1;
    }
    steps.push({ relationship, fromObjectId: currentObjectId, toObjectId: nextObjectId });
    currentObjectId = nextObjectId;
  }
  return { rootObjectId, steps, objectAliases };
}
export function compileJoinOnClause(
  step: JoinPlanStep,
  quoteColumn: (objectId: string, propertyId: string) => string,
): string {
  const { fromKey, toKey } = assertJoinKeys(step.relationship);
  const relationship = step.relationship;
  const { fromObjectId, toObjectId } = step;
  if (relationship.fromObjectId === fromObjectId && relationship.toObjectId === toObjectId) {
    return `${quoteColumn(fromObjectId, fromKey)} = ${quoteColumn(toObjectId, toKey)}`;
  }
  if (relationship.fromObjectId === toObjectId && relationship.toObjectId === fromObjectId) {
    return `${quoteColumn(fromObjectId, toKey)} = ${quoteColumn(toObjectId, fromKey)}`;
  }
  throw new ObjectQueryCompileError(
    "invalid_join",
    `Relationship "${relationship.id}" does not match join step ${fromObjectId} → ${toObjectId}.`,
    { path: "joins", invalidValue: relationship.id },
  );
}
export function resolveObjectInPlan(
  ontology: Ontology,
  plan: JoinPlan,
  objectId: string,
): {
  object: OntologyObject;
  alias: string;
} {
  const alias = plan.objectAliases.get(objectId);
  if (alias === undefined) {
    const joinedIds = [...plan.objectAliases.keys()];
    const entries = objectSuggestionEntries(ontology);
    throw new ObjectQueryCompileError(
      "unknown_join_object",
      `Object "${objectId}" is not in the query join graph. Add relationships via "joins" or filter the root object.`,
      {
        path: "objectId",
        invalidValue: objectId,
        allowed: joinedIds.slice(0, 20),
        suggestions: suggestClosest(objectId, entries),
      },
    );
  }
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    const entries = objectSuggestionEntries(ontology);
    throw new ObjectQueryCompileError(
      "unknown_object",
      `Object "${objectId}" is not part of the ontology.`,
      {
        path: "objectId",
        invalidValue: objectId,
        allowed: allowedValuesFrom(entries),
        suggestions: suggestClosest(objectId, entries),
      },
    );
  }
  return { object, alias };
}
