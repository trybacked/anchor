import { readRowNumber, readRowString } from "./duckdb-row.js";

interface RankedItemInput {
    id: string;
    payload: Record<string, unknown>;
}
interface RankedListInput {
    source: string;
    items: RankedItemInput[];
}
const DEFAULT_RRF_K = 60;
function rrfScore(rank: number, k: number): number {
    return 1 / (k + rank);
}
export function reciprocalRankFusion(lists: RankedListInput[]): Array<{
    id: string;
    score: number;
    source: string;
    payload: Record<string, unknown>;
}> {
    const scores = new Map<string, {
        score: number;
        payload: Record<string, unknown>;
        sources: Set<string>;
    }>();
    for (const list of lists) {
        for (let rank = 0; rank < list.items.length; rank += 1) {
            const item = list.items[rank];
            if (item === undefined) {
                continue;
            }
            const contribution = rrfScore(rank + 1, DEFAULT_RRF_K);
            const existing = scores.get(item.id);
            if (existing === undefined) {
                scores.set(item.id, {
                    score: contribution,
                    payload: item.payload,
                    sources: new Set([list.source]),
                });
            }
            else {
                existing.score += contribution;
                existing.sources.add(list.source);
            }
        }
    }
    return [...scores.entries()]
        .map(([id, entry]) => ({
        id,
        score: entry.score,
        source: [...entry.sources].join("+"),
        payload: entry.payload,
    }))
        .sort((left, right) => right.score - left.score);
}
export function chunkKey(row: Record<string, unknown>): string {
    return `${readRowString(row, "document_id")}:${String(readRowNumber(row, "chunk_index"))}`;
}
