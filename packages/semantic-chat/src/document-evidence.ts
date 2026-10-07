import { significantQuestionTokens } from "./document-intent.js";

function normalizeChunkText(row: Record<string, unknown>): string {
  const raw =
    typeof row.text === "string" ? row.text : typeof row.content === "string" ? row.content : "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readSearchScore(row: Record<string, unknown>): number {
  const score = row.score;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

/** Multi-token subject after stopword removal (used for chunk search and entity profile). */
export function primaryDocumentSearchPhrase(question: string): string {
  const significant = significantQuestionTokens(question);
  if (significant.length > 0) {
    return significant.join(" ");
  }
  return question.trim();
}

export function searchTermsForQuestion(question: string): string[] {
  return significantQuestionTokens(question)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 3);
}

/** Register-style tables: high digit density plus columnar layout (content-based). */
export function isLikelyRegisterTable(text: string): boolean {
  if (text.length < 60) {
    return false;
  }
  const digits = (text.match(/\d/g) ?? []).length;
  const digitRatio = digits / text.length;
  // Columnar records are digit-dense; prose rarely exceeds ~10% digits.
  return digitRatio >= 0.1;
}

export function chunkMatchesSearchTerms(text: string, terms: readonly string[]): boolean {
  if (terms.length <= 1) {
    return true;
  }
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term));
}

export function rankDocumentSearchRows(
  rows: readonly Record<string, unknown>[],
  question: string,
): Record<string, unknown>[] {
  const terms = searchTermsForQuestion(question);
  return [...rows]
    .filter((row) => {
      const text = normalizeChunkText(row);
      if (text.length < 24) {
        return false;
      }
      if (!chunkMatchesSearchTerms(text, terms)) {
        return false;
      }
      return !isLikelyRegisterTable(text);
    })
    .sort((left, right) => {
      const scoreDelta = readSearchScore(right) - readSearchScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return normalizeChunkText(right).length - normalizeChunkText(left).length;
    });
}

export { normalizeChunkText };
