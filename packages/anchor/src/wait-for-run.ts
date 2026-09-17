import { AnchorWaitError } from "./errors.js";
import type { RunStatusResponse } from "./types.js";

/**
 * Minimal client surface required to poll run status.
 */
export interface RunStatusReader {
  /** Fetches the current status for a pipeline run. */
  getRunStatus(tenantId: string, runId: string): Promise<RunStatusResponse>;
}

/**
 * Backoff configuration for {@link waitForRun}.
 */
export interface WaitForRunBackoffOptions {
  /** Multiplier applied to the interval after each poll. Defaults to `1.5`. */
  multiplier?: number;
  /** Upper bound for the polling interval in milliseconds. Defaults to `30_000`. */
  maxIntervalMs?: number;
}

/**
 * Options for {@link waitForRun}.
 */
export interface WaitForRunOptions {
  /** Delay between polls in milliseconds. Defaults to `2_000`. */
  intervalMs?: number;
  /**
   * Maximum time to wait before giving up, in milliseconds.
   * Defaults to `300_000` (5 minutes).
   */
  maxWaitMs?: number;
  /**
   * When `true`, increases the interval using the default multiplier after each poll.
   * Pass an object to customize multiplier and cap.
   */
  backoff?: boolean | WaitForRunBackoffOptions;
  /** Optional abort signal; aborting rejects with {@link AnchorWaitError}. */
  signal?: AbortSignal;
  /** Called after each status poll with the latest response. */
  onPoll?: (status: RunStatusResponse) => void;
}

const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_MAX_WAIT_MS = 300_000;
const DEFAULT_BACKOFF_MULTIPLIER = 1.5;
const DEFAULT_MAX_INTERVAL_MS = 30_000;

/** Terminal run statuses returned by {@link waitForRun}. */
export const TERMINAL_RUN_STATUSES = ["done", "failed"] as const;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new AnchorWaitError("Polling aborted.", { cause: signal.reason }));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new AnchorWaitError("Polling aborted.", { cause: signal?.reason }));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function resolveBackoff(options: WaitForRunOptions): WaitForRunBackoffOptions | undefined {
  if (options.backoff === undefined || options.backoff === false) {
    return undefined;
  }
  if (options.backoff === true) {
    return {};
  }
  return options.backoff;
}

/**
 * Polls run status until a terminal state is reached.
 *
 * Terminal states are `"done"` and `"failed"`. The returned {@link RunStatusResponse}
 * reflects the final polled status.
 *
 * @throws {@link AnchorWaitError} When polling is aborted or {@link WaitForRunOptions.maxWaitMs} is exceeded.
 */
export async function waitForRun(
  client: RunStatusReader,
  tenantId: string,
  runId: string,
  options: WaitForRunOptions = {},
): Promise<RunStatusResponse> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const backoff = resolveBackoff(options);
  const startedAt = Date.now();
  let currentIntervalMs = intervalMs;

  for (;;) {
    const status = await client.getRunStatus(tenantId, runId);
    options.onPoll?.(status);

    if (status.status === "done" || status.status === "failed") {
      return status;
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      throw new AnchorWaitError(
        `Run ${runId} did not reach a terminal state within ${String(maxWaitMs)}ms.`,
      );
    }

    await sleep(currentIntervalMs, options.signal);

    if (backoff !== undefined) {
      const multiplier = backoff.multiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
      const maxInterval = backoff.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
      currentIntervalMs = Math.min(Math.round(currentIntervalMs * multiplier), maxInterval);
    }
  }
}
