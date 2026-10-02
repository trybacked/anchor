import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../../src/rate-limit.js";

describe("rate limiter", () => {
  it("blocks after capacity", () => {
    let now = 0;
    const limiter = createRateLimiter({
      capacity: 2,
      refillPerSecond: 1,
      now: () => now,
    });
    expect(limiter("u").allowed).toBe(true);
    expect(limiter("u").allowed).toBe(true);
    const blocked = limiter("u");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    now += 2000;
    expect(limiter("u").allowed).toBe(true);
  });
});
