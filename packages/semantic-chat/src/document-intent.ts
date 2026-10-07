import type { Ontology } from "@trybacked/core";

/**
 * Semantics-driven intent routing (Plan Fase 6).
 *
 * No procurement/sector keywords and no language data in code: the terms that
 * identify "document archive" intent come from the tenant ontology (glossary,
 * object names, synonyms), and anything else falls through to the LLM agent,
 * which picks tools based on capabilities.
 */

/**
 * Linguistic function words (pronouns, auxiliaries, prepositions) for the
 * supported locales — generic language data, not domain knowledge. Domain
 * vocabulary must come from the ontology (see documentArchiveTermsFromOntology).
 */
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "who",
  "what",
  "when",
  "where",
  "how",
  "why",
  "which",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "to",
  "chi",
  "che",
  "cosa",
  "come",
  "quando",
  "dove",
  "perche",
  "perché",
  "quale",
  "quali",
  "quanti",
  "quante",
  "quanto",
  "è",
  "e",
  "sono",
  "era",
  "di",
  "del",
  "della",
  "dei",
  "degli",
  "delle",
  "un",
  "una",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "su",
  "per",
  "nel",
  "nella",
  "informazioni",
  "parlami",
  "dimmi",
]);

function nameLikeTokens(text: string): string[] {
  return text.split(/\s+/).filter((part) => part.length > 0 && /^[\p{L}'-]+$/u.test(part));
}

const MIN_SINGLE_TOKEN_QUERY_LENGTH = 5;

function addNameQueryVariants(queries: Set<string>, tokens: string[]): void {
  if (tokens.length === 2) {
    const [first, second] = tokens;
    if (first === undefined || second === undefined) {
      return;
    }
    queries.add(`${first} ${second}`);
    queries.add(`${second} ${first}`);
    if (second.length >= MIN_SINGLE_TOKEN_QUERY_LENGTH) {
      queries.add(second);
    }
    if (first.length >= MIN_SINGLE_TOKEN_QUERY_LENGTH) {
      queries.add(first);
    }
    return;
  }
  if (tokens.length >= 3) {
    const surname = tokens.at(-1);
    const given = tokens.at(-2);
    if (surname !== undefined && given !== undefined) {
      queries.add(`${given} ${surname}`);
      queries.add(`${surname} ${given}`);
      if (surname.length >= MIN_SINGLE_TOKEN_QUERY_LENGTH) {
        queries.add(surname);
      }
    }
  }
}

function normalizeQueryToken(token: string): string {
  return token.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Tokens worth searching: function words and bare numbers dropped. */
export function significantQuestionTokens(question: string): string[] {
  return question
    .trim()
    .replace(/\?+$/u, "")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .filter((part) => !FUNCTION_WORDS.has(normalizeQueryToken(part)));
}

/** Search phrases derived from the user question (name order variants included). */
export function documentSearchQueries(question: string): string[] {
  const trimmed = question.trim();
  const queries = new Set<string>([trimmed]);
  const significant = significantQuestionTokens(trimmed);
  if (significant.length > 0) {
    queries.add(significant.join(" "));
    addNameQueryVariants(queries, nameLikeTokens(significant.join(" ")));
  }
  return [...queries];
}

/**
 * Document-archive intent terms, derived from the published ontology: glossary
 * terms plus object names and their synonyms. Domain knowledge stays in data.
 */
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
  return [...terms].filter((term) => term.length >= 2);
}

export function matchesDocumentTerms(question: string, terms: readonly string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const lower = question.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/** Explicit document-archive lookup, decided by ontology semantics — not keywords. */
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
