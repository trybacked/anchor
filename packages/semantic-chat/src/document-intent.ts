const DOCUMENT_KEYWORDS =
  /\b(cv|curriculum|vitae|resume|documento|documenti|pdf|archivio|file|allegat|testo del|contenuto del)\b/i;

export const PROCUREMENT_KEYWORDS =
  /\b(gara|gare|appalt|appalti|contratt|cig|oggetto|ente appalt|aggiudicat|stazione appaltante|bandit|comune di|quanti|quante|numero di|totale)\b/i;

const QUERY_STOPWORDS = new Set([
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
  "tell",
  "me",
  "about",
  "chi",
  "che",
  "cosa",
  "come",
  "quando",
  "dove",
  "perché",
  "perche",
  "quale",
  "quali",
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
  "informazioni",
  "su",
  "parlami",
  "dimmi",
]);

function nameLikeTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((part) => part.length > 0 && /^[\p{L}'-]+$/u.test(part));
}

const MIN_SINGLE_TOKEN_QUERY_LENGTH = 5;

function addNameQueryVariants(queries: Set<string>, tokens: string[]): void {
  if (tokens.length === 2) {
    queries.add(`${tokens[0]} ${tokens[1]}`);
    queries.add(`${tokens[1]} ${tokens[0]}`);
    if (tokens[1].length >= MIN_SINGLE_TOKEN_QUERY_LENGTH) {
      queries.add(tokens[1]);
    }
    if (tokens[0].length >= MIN_SINGLE_TOKEN_QUERY_LENGTH) {
      queries.add(tokens[0]);
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
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function significantQuestionTokens(question: string): string[] {
  return question
    .trim()
    .replace(/\?+$/u, "")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .filter((part) => !QUERY_STOPWORDS.has(normalizeQueryToken(part)));
}

/** Search phrases derived from the user question (stopwords stripped, name order variants). */
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

/** Explicit document-archive lookup (file list), not general Q&A. */
export function questionPrefersDocumentArchive(question: string): boolean {
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (PROCUREMENT_KEYWORDS.test(trimmed)) {
    return false;
  }
  return DOCUMENT_KEYWORDS.test(trimmed);
}
