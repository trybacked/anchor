import type { Ontology } from "@trybacked/core";
import { DEFAULT_SCHEMA_SEARCH_HITS } from "./limits.js";
export type SchemaSearchHit = {
  objectId: string;
  propertyId?: string | undefined;
  score: number;
  label: string;
  kind: "object" | "property" | "glossary";
};
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((token) => token.length >= 2);
}
function scoreTokens(haystack: string, tokens: string[]): number {
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) {
      score += token.length;
    }
  }
  return score;
}
export function searchOntologySchema(
  ontology: Ontology,
  query: string,
  limit = DEFAULT_SCHEMA_SEARCH_HITS,
): SchemaSearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return [];
  }
  const hits: SchemaSearchHit[] = [];
  for (const object of ontology.objects) {
    const objectText = [
      object.id,
      object.name,
      object.description ?? "",
      ...(object.semantics?.synonyms ?? []),
    ].join(" ");
    const objectScore = scoreTokens(objectText, tokens);
    if (objectScore > 0) {
      hits.push({
        objectId: object.id,
        score: objectScore,
        label: object.name,
        kind: "object",
      });
    }
    for (const property of object.properties) {
      const propertyText = [
        property.id,
        property.name,
        property.semantics?.description ?? "",
        ...(property.semantics?.synonyms ?? []),
        property.semantics?.semanticRole ?? "",
      ].join(" ");
      const propertyScore = scoreTokens(propertyText, tokens);
      if (propertyScore > 0) {
        hits.push({
          objectId: object.id,
          propertyId: property.id,
          score: propertyScore + 1,
          label: `${object.name}.${property.name}`,
          kind: "property",
        });
      }
    }
  }
  for (const term of ontology.semantics?.glossary ?? []) {
    const glossaryScore = scoreTokens(`${term.term} ${term.definition}`, tokens);
    if (glossaryScore > 0) {
      hits.push({
        objectId: term.objectId ?? "",
        ...(term.propertyId !== undefined ? { propertyId: term.propertyId } : {}),
        score: glossaryScore + 2,
        label: term.term,
        kind: "glossary",
      });
    }
  }
  hits.sort((left, right) => right.score - left.score);
  return hits.slice(0, limit);
}
