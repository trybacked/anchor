/** SPIRES / Text2KGBench: extracted values must appear in source text (anti-hallucination). */
export function verifyEvidenceInSource(plainText: string, value: string): boolean {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (plainText.includes(normalized)) {
    return true;
  }
  return plainText.toLowerCase().includes(normalized.toLowerCase());
}

export function excerptAroundMatch(plainText: string, value: string, radius = 120): string | null {
  const index = plainText.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) {
    return null;
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(plainText.length, index + value.length + radius);
  return plainText.slice(start, end);
}
