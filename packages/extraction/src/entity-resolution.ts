export type ResolvedEntity = {
  canonicalId: string;
  label: string;
  aliases: string[];
};

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

/** Simple deduplication for extracted string keys (data wrangling 2205.09911). */
export function resolveEntitiesByLabel(
  candidates: Array<{ id: string; label: string }>,
): ResolvedEntity[] {
  const byKey = new Map<string, ResolvedEntity>();
  for (const candidate of candidates) {
    const key = normalizeLabel(candidate.label);
    if (key.length === 0) {
      continue;
    }
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { canonicalId: candidate.id, label: candidate.label.trim(), aliases: [] });
      continue;
    }
    if (!existing.aliases.includes(candidate.label)) {
      existing.aliases.push(candidate.label);
    }
  }
  return [...byKey.values()];
}
