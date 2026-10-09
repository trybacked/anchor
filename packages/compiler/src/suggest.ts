import type { Ontology, OntologyObject } from "@trybacked/core";

export type SuggestionEntry = {
  canonical: string;
  aliases?: readonly string[] | undefined;
};
export const MAX_QUERY_SUGGESTIONS = 3;

export const MAX_ALLOWED_VALUES = 20;
export type LevenshteinOptions = {
  insert?: number;
  remove?: number;
  substitute?: number;
};

export function levenshteinDistance(
  left: string,
  right: string,
  options: LevenshteinOptions = {},
): number {
  const insert = options.insert ?? 1;
  const remove = options.remove ?? 1;
  const substitute = options.substitute ?? 1;
  if (left.length === 0) return right.length * insert;
  if (right.length === 0) return left.length * remove;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index * insert);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const leftChar = left[leftIndex - 1] ?? "";
    const current: number[] = [leftIndex * remove];
    let diagonal = previous[0] ?? 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const rightChar = right[rightIndex - 1] ?? "";
      const substitutionCost = leftChar === rightChar ? 0 : substitute;
      current[rightIndex] = Math.min(
        (previous[rightIndex] ?? 0) + remove,
        (current[rightIndex - 1] ?? 0) + insert,
        diagonal + substitutionCost,
      );
      diagonal = previous[rightIndex] ?? 0;
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

export function normalizeForSuggestions(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(/[_\s.-]/g, "");
}
type CandidateMatch = {
  canonical: string;
  distance: number;
};
function candidateMatches(value: string, entry: SuggestionEntry): CandidateMatch | undefined {
  const spellings = [entry.canonical, ...(entry.aliases ?? [])].map(normalizeForSuggestions);
  let best: CandidateMatch | undefined;
  for (const spelling of spellings) {
    if (spelling.length === 0) continue;
    const distance = levenshteinDistance(value, spelling);
    const maxLength = Math.max(value.length, spelling.length);
    const containment = spelling.includes(value) || value.includes(spelling);
    const threshold = Math.max(2, Math.floor(maxLength / 3));
    if (distance > threshold && !containment) continue;
    const containmentPenalty = containment ? 0 : 1;
    const score = distance + containmentPenalty;
    if (best === undefined || score < best.distance) {
      best = { canonical: entry.canonical, distance: score };
    }
  }
  return best;
}

export function suggestClosest(
  value: string,
  entries: readonly SuggestionEntry[],
  limit = MAX_QUERY_SUGGESTIONS,
): string[] {
  const normalized = normalizeForSuggestions(value);
  if (normalized.length === 0 || entries.length === 0) return [];
  const matches: CandidateMatch[] = [];
  for (const entry of entries) {
    const match = candidateMatches(normalized, entry);
    if (match === undefined) continue;
    matches.push(match);
  }
  return matches
    .sort(
      (left, right) =>
        left.distance - right.distance || left.canonical.localeCompare(right.canonical),
    )
    .slice(0, limit)
    .map((match) => match.canonical);
}

export function allowedValuesFrom(
  entries: readonly SuggestionEntry[],
  cap = MAX_ALLOWED_VALUES,
): string[] {
  return entries.slice(0, cap).map((entry) => entry.canonical);
}
const aliasList = (...groups: (readonly string[] | undefined)[]): string[] => [
  ...new Set(groups.flatMap((group) => group ?? [])),
];

export function propertySuggestionEntries(object: OntologyObject): SuggestionEntry[] {
  return object.properties.map((property) => ({
    canonical: property.id,
    aliases: aliasList(
      property.semantics?.synonyms,
      Object.values(property.semantics?.labels ?? {}),
    ),
  }));
}

export function objectSuggestionEntries(ontology: Ontology): SuggestionEntry[] {
  return ontology.objects.map((object) => ({
    canonical: object.id,
    aliases: aliasList(
      object.semantics?.synonyms,
      Object.values(object.semantics?.labels ?? {}).flatMap((label) => [
        label.singular,
        label.plural,
      ]),
    ),
  }));
}

export function relationshipSuggestionEntries(ontology: Ontology): SuggestionEntry[] {
  return ontology.relationships.map((relationship) => ({
    canonical: relationship.id,
    aliases: [relationship.name],
  }));
}
