import type { ObjectQuery } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";
import { SemanticPlanValidationError } from "./validate-plan.js";

const PROPERTY_ID_IN_QUESTION = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

function relatedObjectsWithProperty(
  ontology: Ontology,
  rootObjectId: string,
  propertyId: string,
): string[] {
  const neighborIds = new Set<string>();
  for (const relation of ontology.relationships) {
    if (relation.fromObjectId === rootObjectId) {
      neighborIds.add(relation.toObjectId);
    }
    if (relation.toObjectId === rootObjectId) {
      neighborIds.add(relation.fromObjectId);
    }
  }
  return [...neighborIds].filter((objectId) => {
    const object = ontology.objects.find((candidate) => candidate.id === objectId);
    return object?.properties.some((property) => property.id === propertyId) ?? false;
  });
}

function glossaryRelatedObjectsForProperty(
  ontology: Ontology,
  question: string,
  propertyId: string,
): string[] {
  const normalizedQuestion = question.toLowerCase();
  const objectIds = new Set<string>();
  for (const entry of ontology.semantics?.glossary ?? []) {
    if (entry.propertyId !== propertyId || entry.objectId === undefined) {
      continue;
    }
    const fragments = entry.term
      .toLowerCase()
      .split(/[/,]/)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 2);
    if (fragments.some((fragment) => normalizedQuestion.includes(fragment))) {
      objectIds.add(entry.objectId);
    }
  }
  return [...objectIds];
}

function objectMentionedInQuestion(
  ontology: Ontology,
  objectId: string,
  question: string,
): boolean {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    return false;
  }
  const normalizedQuestion = question.toLowerCase();
  const labels = [object.id, object.name, ...(object.semantics?.synonyms ?? [])].map((label) =>
    label.toLowerCase(),
  );
  return labels.some((label) => label.length > 2 && normalizedQuestion.includes(label));
}

export function unknownPropertyMentionInQuestion(
  ontology: Ontology,
  question: string,
): string | undefined {
  const known = new Set<string>();
  for (const object of ontology.objects) {
    for (const property of object.properties) {
      known.add(property.id);
    }
  }
  for (const match of question.matchAll(PROPERTY_ID_IN_QUESTION)) {
    const token = match[0];
    if (!known.has(token)) {
      return token;
    }
  }
  return undefined;
}

export function assertQuestionDoesNotMentionUnknownProperties(
  ontology: Ontology,
  question: string,
): void {
  const unknown = unknownPropertyMentionInQuestion(ontology, question);
  if (unknown !== undefined) {
    throw new SemanticPlanValidationError(
      `Unknown property "${unknown}" mentioned in the question (not defined in the ontology).`,
    );
  }
}

function relatedEntityFilterRequired(
  ontology: Ontology,
  question: string,
  query: ObjectQuery,
  propertyId: string,
): string[] | undefined {
  const rootObjectId = query.objectId;
  const related = relatedObjectsWithProperty(ontology, rootObjectId, propertyId);
  if (related.length === 0) {
    return undefined;
  }
  const glossaryRelated = glossaryRelatedObjectsForProperty(ontology, question, propertyId);
  const mentionedRelated = related.filter(
    (objectId) =>
      objectId !== rootObjectId && objectMentionedInQuestion(ontology, objectId, question),
  );
  const targetRelated = [...new Set([...glossaryRelated, ...mentionedRelated])].filter((objectId) =>
    related.includes(objectId),
  );
  return targetRelated.length > 0 ? targetRelated : undefined;
}

function assertDenormalizedFiltersTargetRelatedEntity(
  ontology: Ontology,
  question: string,
  query: ObjectQuery,
): void {
  const rootObjectId = query.objectId;
  const filters = query.filters ?? [];
  const propertyIds = new Set(filters.map((filter) => filter.propertyId));
  for (const propertyId of propertyIds) {
    const targetRelated = relatedEntityFilterRequired(ontology, question, query, propertyId);
    if (targetRelated === undefined) {
      continue;
    }
    const hasRelatedFilter = filters.some(
      (filter) =>
        filter.propertyId === propertyId && targetRelated.includes(filter.objectId ?? rootObjectId),
    );
    const hasRootFilter = filters.some(
      (filter) =>
        filter.propertyId === propertyId && (filter.objectId ?? rootObjectId) === rootObjectId,
    );
    if (hasRelatedFilter) {
      continue;
    }
    const hasJoin = (query.joins ?? []).some((join) =>
      ontology.relationships.some(
        (relation) =>
          relation.id === join.relationshipId &&
          (relation.fromObjectId === rootObjectId || relation.toObjectId === rootObjectId),
      ),
    );
    const hint = `use joins and filters with objectId ${targetRelated.join(" or ")}`;
    if (hasRootFilter) {
      throw new SemanticPlanValidationError(
        `Missing filter on ${targetRelated.join(" or ")} for ${propertyId}; ${hint}.`,
      );
    }
    if (!hasJoin) {
      throw new SemanticPlanValidationError(
        `Filter ${propertyId} on ${rootObjectId} is ambiguous for this question: ${hint}.`,
      );
    }
    throw new SemanticPlanValidationError(
      `Missing filter on ${targetRelated.join(" or ")} for ${propertyId}; ${hint}.`,
    );
  }
}

export function validateAgentObjectQuery(
  ontology: Ontology,
  question: string,
  query: ObjectQuery,
): ObjectQuery {
  assertDenormalizedFiltersTargetRelatedEntity(ontology, question, query);
  return query;
}
