import { describe, expect, it } from "vitest";
import { runEvaluation } from "../../src/run-evaluation.js";

describe("runEvaluation", () => {
  it("reports missing v2 model when model.yaml absent", async () => {
    await expect(
      runEvaluation({ workspaceRoot: "/tmp/nonexistent-backed-workspace", env: process.env }),
    ).rejects.toThrow();
  });
});
