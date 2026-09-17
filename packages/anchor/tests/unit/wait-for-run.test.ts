import { describe, expect, it, vi } from "vitest";
import { AnchorWaitError } from "../../src/errors.js";
import { waitForRun } from "../../src/wait-for-run.js";

describe("waitForRun", () => {
  it("polls until the run reaches a terminal state", async () => {
    let calls = 0;
    const reader = {
      getRunStatus: vi.fn(async () => {
        calls += 1;
        if (calls < 3) {
          return { status: "running" as const };
        }
        return { status: "done" as const };
      }),
    };

    const result = await waitForRun(reader, "demo", "00000000-0000-4000-8000-000000000001", {
      intervalMs: 1,
    });

    expect(result.status).toBe("done");
    expect(reader.getRunStatus).toHaveBeenCalledTimes(3);
  });

  it("returns immediately when the run has failed", async () => {
    const reader = {
      getRunStatus: vi.fn(async () => ({ status: "failed" as const, error: "pipeline error" })),
    };

    const result = await waitForRun(reader, "demo", "run-failed", { intervalMs: 1 });
    expect(result.status).toBe("failed");
    expect(reader.getRunStatus).toHaveBeenCalledTimes(1);
  });

  it("throws when maxWaitMs is exceeded", async () => {
    const reader = {
      getRunStatus: vi.fn(async () => ({ status: "running" as const })),
    };

    await expect(
      waitForRun(reader, "demo", "run-slow", { intervalMs: 1, maxWaitMs: 5 }),
    ).rejects.toThrow(AnchorWaitError);
  });

  it("rejects when the abort signal fires", async () => {
    const controller = new AbortController();
    const reader = {
      getRunStatus: vi.fn(async () => {
        controller.abort("user cancelled");
        return { status: "running" as const };
      }),
    };

    await expect(
      waitForRun(reader, "demo", "run-abort", { intervalMs: 10, signal: controller.signal }),
    ).rejects.toThrow(AnchorWaitError);
  });

  it("applies exponential backoff between polls", async () => {
    let calls = 0;
    const reader = {
      getRunStatus: vi.fn(async () => {
        calls += 1;
        if (calls < 3) {
          return { status: "running" as const };
        }
        return { status: "done" as const };
      }),
    };

    const result = await waitForRun(reader, "demo", "run-backoff", {
      intervalMs: 1,
      backoff: { multiplier: 2, maxIntervalMs: 4 },
    });
    expect(result.status).toBe("done");
  });
});
