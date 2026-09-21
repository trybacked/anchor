export class PipelineAbortedError extends Error {
  constructor() {
    super("Pipeline run was aborted");
    this.name = "PipelineAbortedError";
  }
}

export function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new PipelineAbortedError();
  }
}

export async function sleepUnlessAborted(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (ms <= 0) {
    assertNotAborted(signal);
    return;
  }
  assertNotAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(new PipelineAbortedError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
