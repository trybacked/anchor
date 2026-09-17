import { describe, expect, it, vi } from "vitest";
import { createRobustFetch, mergeAbortSignals } from "../../src/http.js";

describe("mergeAbortSignals", () => {
  it("returns undefined when no signals are provided", () => {
    expect(mergeAbortSignals()).toBeUndefined();
  });

  it("returns the sole signal unchanged", () => {
    const controller = new AbortController();
    expect(mergeAbortSignals(undefined, controller.signal)).toBe(controller.signal);
  });

  it("aborts when any merged signal aborts", () => {
    const controller = new AbortController();
    const merged = mergeAbortSignals(controller.signal);
    controller.abort("stop");
    expect(merged?.aborted).toBe(true);
  });

  it("merges multiple signals", () => {
    const first = new AbortController();
    const second = new AbortController();
    const merged = mergeAbortSignals(first.signal, second.signal);
    second.abort("stop");
    expect(merged?.aborted).toBe(true);
  });

  it("propagates an already-aborted signal", () => {
    const controller = new AbortController();
    controller.abort("done");
    const merged = mergeAbortSignals(controller.signal, new AbortController().signal);
    expect(merged?.aborted).toBe(true);
  });
});

describe("createRobustFetch", () => {
  it("retries transient 5xx responses when retry is enabled", async () => {
    let calls = 0;
    const baseFetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("fail", { status: 503 });
      }
      return new Response("ok", { status: 200 });
    });

    const fetchImpl = createRobustFetch(baseFetch, { retry: { maxRetries: 2, initialDelayMs: 1 } });
    const response = await fetchImpl("http://example.test/retry");
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("retries network failures when retry is enabled", async () => {
    let calls = 0;
    const baseFetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("fetch failed");
      }
      return new Response("ok", { status: 200 });
    });

    const fetchImpl = createRobustFetch(baseFetch, { retry: { maxRetries: 1, initialDelayMs: 1 } });
    const response = await fetchImpl("http://example.test/network");
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not swallow abort errors", async () => {
    const baseFetch = vi.fn(async (_input, init) => {
      init?.signal?.addEventListener("abort", () => {
        throw new DOMException("Aborted", "AbortError");
      });
      throw new DOMException("Aborted", "AbortError");
    });
    const fetchImpl = createRobustFetch(baseFetch, { retry: { maxRetries: 3, initialDelayMs: 1 } });
    await expect(
      fetchImpl("http://example.test/abort", { signal: AbortSignal.abort("stop") }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("does not retry when retry is disabled", async () => {
    const baseFetch = vi.fn(async () => new Response("fail", { status: 503 }));
    const fetchImpl = createRobustFetch(baseFetch, { retry: false });
    const response = await fetchImpl("http://example.test/no-retry");
    expect(response.status).toBe(503);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });
});
