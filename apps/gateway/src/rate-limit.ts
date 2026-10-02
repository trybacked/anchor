export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export function createRateLimiter(options: {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}): (key: string) => RateLimitResult {
  const nowFn = options.now ?? (() => Date.now());
  const buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  return (key: string): RateLimitResult => {
    const nowMs = nowFn();
    const existing = buckets.get(key);
    const bucket = existing ?? { tokens: options.capacity, lastRefillMs: nowMs };
    const elapsedSeconds = (nowMs - bucket.lastRefillMs) / 1000;
    const refilled = Math.min(
      options.capacity,
      bucket.tokens + elapsedSeconds * options.refillPerSecond,
    );
    bucket.tokens = refilled;
    bucket.lastRefillMs = nowMs;

    if (bucket.tokens < 1) {
      const deficit = 1 - bucket.tokens;
      const retryAfterSeconds = Math.ceil(deficit / options.refillPerSecond);
      buckets.set(key, bucket);
      return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { allowed: true };
  };
}
