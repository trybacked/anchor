import { describe, expect, it } from "vitest";
import { chunkAuthoringCommands, validateDiscoveryReview } from "../../src/discovery-review.js";
import type { Proposal } from "@trybacked/core";

describe("validateDiscoveryReview", () => {
  it("lists unanswered proposal questions", () => {
    const proposal = {
      runId: "run-1",
      generatedAt: new Date().toISOString(),
      entities: [],
      relations: [],
      rules: [],
      doubts: [],
      questions: [
        {
          id: "q_entity_documents",
          kind: "entity" as const,
          targetId: "documents",
          question: "Keep documents?",
          impact: 1,
          uncertainty: 0.1,
          risk: 0.1,
          evidence: { title: "t", columns: [], rows: [] },
        },
      ],
    } satisfies Proposal;
    const result = validateDiscoveryReview(proposal, {
      runId: "run-1",
      answeredAt: new Date().toISOString(),
      answers: [],
    });
    expect(result.unansweredQuestionIds).toEqual(["q_entity_documents"]);
  });
});

describe("chunkAuthoringCommands", () => {
  it("splits commands into fixed-size batches", () => {
    const commands = Array.from({ length: 250 }, (_, index) => ({
      type: "removeRule" as const,
      ruleId: `rule-${String(index)}`,
    }));
    const batches = chunkAuthoringCommands(commands, 100);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
  });
});
