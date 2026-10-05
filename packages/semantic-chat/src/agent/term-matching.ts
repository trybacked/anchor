import type { OntologyProperty } from "@trybacked/core";
const MIN_TERM_LENGTH = 4;
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function mentions(text: string, term: string): boolean {
  const needle = normalizeForMatch(term);
  if (needle.length < MIN_TERM_LENGTH) return false;
  return ` ${normalizeForMatch(text)} `.includes(` ${needle} `);
}
export function propertyTerms(property: OntologyProperty): string[] {
  return [property.id, property.name, ...(property.semantics?.synonyms ?? [])];
}
export function propertyMentioned(text: string, property: OntologyProperty): boolean {
  return propertyTerms(property).some((term) => mentions(text, term));
}
