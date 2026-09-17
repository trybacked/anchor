import { AnchorClientError } from "./errors.js";

/**
 * Removes a trailing slash from a base URL.
 */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Builds Authorization and optional extra headers for raw fetch calls.
 */
export function buildAuthHeaders(
  token: string,
  extraHeaders: Record<string, string> = {},
): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }
  return headers;
}

/**
 * Builds a tenant-scoped API path under `/v1/tenants/{tenantId}`.
 */
export function tenantPath(baseUrl: string, tenantId: string, suffix: string): string {
  return `${stripTrailingSlash(baseUrl)}/v1/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}

/**
 * Options for exponential backoff retries on transient HTTP failures.
 */
export interface RetryOptions {
  /** Maximum retry attempts after the initial request. Defaults to `3`. */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds. Defaults to `250`. */
  initialDelayMs?: number;
  /** Maximum backoff delay in milliseconds. Defaults to `5_000`. */
  maxDelayMs?: number;
}

/**
 * Configuration for {@link createRobustFetch}.
 */
export interface RobustFetchOptions {
  /** Per-request timeout in milliseconds. Defaults to `30_000`. */
  timeoutMs?: number;
  /** Retry policy; `false` disables retries (default). */
  retry?: RetryOptions | false;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof AnchorClientError) {
    return isRetryableStatus(error.status);
  }
  return true;
}

/**
 * Merges multiple abort signals; aborts when any input signal aborts.
 */
export function mergeAbortSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (active.length === 0) {
    return undefined;
  }
  if (active.length === 1) {
    return active[0];
  }

  const controller = new AbortController();
  const onAbort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
  };

  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        onAbort(signal);
      },
      { once: true },
    );
  }

  return controller.signal;
}

/**
 * Wraps `fetch` with default timeouts, optional per-request signals, and opt-in retry with exponential backoff.
 *
 * Retries apply only to network failures and HTTP 5xx responses.
 */
export function createRobustFetch(
  baseFetch: typeof fetch,
  options: RobustFetchOptions = {},
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryOptions = options.retry === false ? undefined : options.retry;

  return async (input, init) => {
    const maxRetries = retryOptions?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const initialDelayMs = retryOptions?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const maxDelayMs = retryOptions?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

    let attempt = 0;

    for (;;) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = mergeAbortSignals(init?.signal ?? undefined, timeoutSignal);

      try {
        const response = await baseFetch(input, {
          ...init,
          ...(signal !== undefined ? { signal } : {}),
        });

        if (
          retryOptions !== undefined &&
          isRetryableStatus(response.status) &&
          attempt < maxRetries
        ) {
          attempt += 1;
          const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
          await sleep(delayMs);
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        if (retryOptions !== undefined && attempt < maxRetries && isRetryableError(error)) {
          attempt += 1;
          const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
          await sleep(delayMs);
          continue;
        }
        throw error;
      }
    }
  };
}
