const MIN_TERM_LENGTH = 2;
const MAX_TERMS = 12;

export function splitQueryTerms(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const terms = normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= MIN_TERM_LENGTH);
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

export type ScoredSqlExpression = {
  expression: string;
  parameters: { name: string; value: string }[];
};

export function keywordScoreExpression(
  contentColumn: string,
  terms: readonly string[],
): ScoredSqlExpression {
  const parameters = terms.map((term, index) => ({ name: `term${String(index)}`, value: term }));
  const termCounts = parameters.map(({ name }) => {
    const placeholder = `:${name}`;
    return `(LENGTH(${contentColumn}) - LENGTH(REPLACE(LOWER(${contentColumn}), LOWER(${placeholder}), ''))) / LENGTH(${placeholder})`;
  });
  const expression = termCounts.length > 0 ? termCounts.join(" + ") : "0";
  return { expression, parameters };
}

export function keywordOrderByClause(scoreAlias: string, contentColumn: string): string {
  return `ORDER BY ${scoreAlias} DESC, LENGTH(${contentColumn}) ASC`;
}
