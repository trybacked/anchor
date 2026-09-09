export async function mapWithConcurrency<TItem, TResult>(items: TItem[], concurrency: number, worker: (item: TItem, index: number) => Promise<TResult>): Promise<TResult[]> {
    if (items.length === 0) {
        return [];
    }
    const limit = Math.max(1, concurrency);
    const results: Array<TResult | undefined> = Array.from({ length: items.length });
    let nextIndex = 0;
    async function runWorker(): Promise<void> {
        for (;;) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= items.length) {
                return;
            }
            const item = items[index];
            if (item === undefined) {
                continue;
            }
            results[index] = await worker(item, index);
        }
    }
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
    await Promise.all(workers);
    return results.map((result, index) => {
        if (result === undefined) {
            throw new Error(`missing concurrency result at index ${String(index)}`);
        }
        return result;
    });
}
