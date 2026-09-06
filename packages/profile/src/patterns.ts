import { PROFILE_PATTERN_MATCH_THRESHOLD } from "@backed/core";
import type { DetectedPattern, DetectedPatternKind } from "@backed/core";

const DATE_PATTERNS: readonly RegExp[] = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  /^\d{1,2}-\d{1,2}-\d{4}$/,
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// TODO: check-digit validation (Luhn-like algorithm for Italian VAT numbers).
const VAT_NUMBER_PATTERN = /^\d{11}$/;

// Standard Italian personal fiscal code structure.
// TODO: control-character validation and omocodia handling.
const FISCAL_CODE_PATTERN = /^[A-Z]{6}\d{2}[ABCDEHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/i;

// Amount with required decimals, European or Anglo separator,
// optional thousands grouping. A plain integer is not treated as an amount.
const AMOUNT_PATTERN =
  /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$|^-?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{1,2}$/;

export function matchesDate(value: string): boolean {
  return DATE_PATTERNS.some((pattern) => pattern.test(value));
}

export function matchesEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function matchesVatNumber(value: string): boolean {
  return VAT_NUMBER_PATTERN.test(value);
}

export function matchesFiscalCode(value: string): boolean {
  return FISCAL_CODE_PATTERN.test(value);
}

export function matchesAmount(value: string): boolean {
  return AMOUNT_PATTERN.test(value);
}

const MATCHERS: ReadonlyArray<{
  kind: DetectedPatternKind;
  matches: (value: string) => boolean;
}> = [
  { kind: "date", matches: matchesDate },
  { kind: "email", matches: matchesEmail },
  { kind: "vat_number", matches: matchesVatNumber },
  { kind: "fiscal_code", matches: matchesFiscalCode },
  { kind: "amount", matches: matchesAmount },
];

/** Pattern detection on sampled values; returns patterns above threshold. */
export function detectPatterns(values: readonly string[]): DetectedPattern[] {
  const trimmed = values.map((value) => value.trim()).filter((value) => value !== "");
  if (trimmed.length === 0) {
    return [];
  }

  const detected: DetectedPattern[] = [];
  for (const matcher of MATCHERS) {
    const matchCount = trimmed.filter(matcher.matches).length;
    const matchRatio = matchCount / trimmed.length;
    if (matchRatio >= PROFILE_PATTERN_MATCH_THRESHOLD) {
      detected.push({ kind: matcher.kind, matchRatio });
    }
  }
  return detected;
}
