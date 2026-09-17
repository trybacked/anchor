import type { NumberFormat } from "./domain.js";

/**
 * Parses a locale-formatted numeric string into a JavaScript number.
 *
 * @returns `null` when the input is empty or cannot be parsed.
 */
export function parseLocalizedNumber(raw: string, format: NumberFormat): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const [groupSeparator, decimalSeparator] = format === "decimal_comma" ? [".", ","] : [",", "."];
  const normalized = trimmed.split(groupSeparator).join("").replace(decimalSeparator, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
