import { resolveLlmMaxInflight } from "./env.js";
import { assertNotAborted, PipelineAbortedError } from "./pipeline-abort.js";

class LlmSemaphore {
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxInflight: number) {}

  async acquire(signal: AbortSignal | undefined): Promise<void> {
    assertNotAborted(signal);
    if (this.inFlight < this.maxInflight) {
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        removeWaiter();
        reject(new PipelineAbortedError());
      };
      const grant = (): void => {
        signal?.removeEventListener("abort", onAbort);
        this.inFlight += 1;
        resolve();
      };
      const waiter = (): void => {
        grant();
      };
      const removeWaiter = (): void => {
        signal?.removeEventListener("abort", onAbort);
        const index = this.queue.indexOf(waiter);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.queue.push(waiter);
    });
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    next?.();
  }
}

let sharedSemaphore: LlmSemaphore | undefined;

function getSharedLlmSemaphore(): LlmSemaphore {
  sharedSemaphore ??= new LlmSemaphore(resolveLlmMaxInflight());
  return sharedSemaphore;
}

export async function withLlmSlot<T>(
  signal: AbortSignal | undefined,
  work: () => Promise<T>,
): Promise<T> {
  const semaphore = getSharedLlmSemaphore();
  await semaphore.acquire(signal);
  try {
    return await work();
  } finally {
    semaphore.release();
  }
}

/** Test-only: reset global semaphore state between cases. */
export function resetLlmSemaphoreForTests(maxInflight?: number): void {
  sharedSemaphore = new LlmSemaphore(maxInflight ?? resolveLlmMaxInflight());
}
