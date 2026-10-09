import type { Ontology } from "@trybacked/core";

const MIN_TERM_LENGTH = 2;

export function documentArchiveTermsFromOntology(ontology: Ontology): string[] {
  const terms = new Set<string>();
  for (const term of ontology.semantics?.glossary ?? []) {
    terms.add(term.term.toLowerCase());
  }
  for (const object of ontology.objects) {
    terms.add(object.name.toLowerCase());
    for (const synonym of object.semantics?.synonyms ?? []) {
      terms.add(synonym.toLowerCase());
    }
  }
  return [...terms].filter((term) => term.length >= MIN_TERM_LENGTH);
}

export function matchesDocumentTerms(question: string, terms: readonly string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const lower = question.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

export function questionPrefersDocumentArchive(
  question: string,
  documentTerms: readonly string[] = [],
): boolean {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return matchesDocumentTerms(trimmed, documentTerms);
}
