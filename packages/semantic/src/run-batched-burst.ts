import type { z } from "zod";
import { mapWithConcurrency } from "./concurrency.js";
import {
  EMPTY_BURST_USAGE,
  runBurst,
  sumBurstUsage,
  type BurstRequest,
  type BurstResult,
  type BurstUsage,
} from "./burst.js";

export function chunkBySize<T>(items: T[], batchSize: number): T[][] {
  if (items.length === 0 || batchSize < 1) {
    return [];
  }
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    batches.push(items.slice(offset, offset + batchSize));
  }
  return batches;
}

export interface MapBurstBatchesOptions<TBatch, TSchema extends z.ZodTypeAny> {
  batches: TBatch[];
  concurrency: number;
  signal?: AbortSignal;
  buildRequest: (batch: TBatch, batchIndex: number, batchCount: number) => BurstRequest<TSchema>;
  onBatchStart?: (batchIndex: number, batchCount: number) => void;
  onBatchComplete?: (completed: number, total: number) => void;
}

export async function mapBurstBatches<TBatch, TSchema extends z.ZodTypeAny>(
  options: MapBurstBatchesOptions<TBatch, TSchema>,
): Promise<BurstResult<z.infer<TSchema>>[]> {
  const batchCount = options.batches.length;
  if (batchCount === 0) {
    return [];
  }
  options.onBatchComplete?.(0, batchCount);
  let completed = 0;
  return mapWithConcurrency(options.batches, options.concurrency, async (batch, index) => {
    const batchIndex = index + 1;
    options.onBatchStart?.(batchIndex, batchCount);
    const result = await runBurst(
      options.buildRequest(batch, batchIndex, batchCount),
    );
    completed += 1;
    options.onBatchComplete?.(completed, batchCount);
    return result;
  });
}

export function sumBurstResults<T>(results: BurstResult<T>[]): BurstUsage {
  if (results.length === 0) {
    return EMPTY_BURST_USAGE;
  }
  return results.reduce(
    (usage, result) => sumBurstUsage(usage, result.usage),
    EMPTY_BURST_USAGE,
  );
}
