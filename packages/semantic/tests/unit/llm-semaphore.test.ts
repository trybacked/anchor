import { describe, expect, it } from "vitest";
import { PipelineAbortedError } from "../../src/pipeline-abort.js";
import { resetLlmSemaphoreForTests, withLlmSlot } from "../../src/llm-semaphore.js";

describe("withLlmSlot", () => {
  it("limits concurrent LLM slots", async () => {
    resetLlmSemaphoreForTests(1);
    let inFlight = 0;
    let maxObserved = 0;
    const hold = async (): Promise<void> => {
      inFlight += 1;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
      inFlight -= 1;
    };
    await Promise.all([withLlmSlot(undefined, hold), withLlmSlot(undefined, hold)]);
    expect(maxObserved).toBe(1);
  });

  it("rejects when the abort signal fires while waiting", async () => {
    resetLlmSemaphoreForTests(1);
    const controller = new AbortController();
    const first = withLlmSlot(undefined, async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    controller.abort();
    await expect(
      withLlmSlot(controller.signal, async () => {
        return "unused";
      }),
    ).rejects.toBeInstanceOf(PipelineAbortedError);
    await first;
  });
});
