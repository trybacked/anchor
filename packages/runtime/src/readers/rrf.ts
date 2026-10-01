const RRF_K = 60;

export type RankedRow = {
  id: string;
  row: Record<string, unknown>;
};

/** Reciprocal rank fusion across ordered result lists (same id = same chunk row). */
export function reciprocalRankFusion(
  lists: RankedRow[][],
  limit: number,
): Record<string, unknown>[] {
  const scores = new Map<string, { score: number; row: Record<string, unknown> }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = scores.get(item.id);
      if (existing === undefined) {
        scores.set(item.id, { score: contribution, row: item.row });
      } else {
        existing.score += contribution;
      }
    });
  }
  return [...scores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score, row }) => ({ ...row, score }));
}
