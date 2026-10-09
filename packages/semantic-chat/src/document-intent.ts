import {
  documentArchiveTermsFromOntology,
  matchesDocumentTerms,
  questionPrefersDocumentArchive,
} from "@trybacked/service";
import functionWordsList from "./function-words.json" with { type: "json" };

export { documentArchiveTermsFromOntology, matchesDocumentTerms, questionPrefersDocumentArchive };

const FUNCTION_WORDS = new Set<string>(functionWordsList);

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

export function significantQuestionTokens(question: string): string[] {
  return question
    .trim()
    .replace(/\?+$/u, "")
    .split(/[\s'’]+/)
    .filter((part) => part.length > 0)
    .filter((part) => !FUNCTION_WORDS.has(normalizeQueryToken(part)));
}

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
