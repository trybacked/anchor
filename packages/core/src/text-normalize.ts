/**
 * Normalizes a document line for fuzzy comparison by lowercasing, collapsing
 * whitespace, and replacing digit runs with `#`.
 */
export function normalizeComparableLine(line: string): string {
  return line.trim().toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
}
