import { describe, expect, it } from "vitest";

import type { Entity } from "@backed/core";
import { MAX_REVIEW_QUESTIONS } from "@backed/core";

import {
  capReviewQuestions,
  reviewBudgetDoubts,
  selectReviewQuestions,
} from "../../src/questions.js";

function entity(id: string, confidence: number, sourceTable = id): Entity {
  return {
    id,
    name: id,
    sourceTable,
    status: "proposed",
    confidence,
    provenance: { table: sourceTable, evidence: "Fixture" },
    properties: [],
  };
}

describe("capReviewQuestions", () => {
  it("keeps at most MAX_REVIEW_QUESTIONS sorted by risk", () => {
    const entities = Array.from({ length: 15 }, (_, index) =>
      entity(`entity-${String(index)}`, 0.5 + index * 0.01),
    );
    const allQuestions = selectReviewQuestions(entities, [], [], []);
    expect(allQuestions.length).toBeGreaterThan(MAX_REVIEW_QUESTIONS);

    const { questions, dropped } = capReviewQuestions(allQuestions);
    expect(questions).toHaveLength(MAX_REVIEW_QUESTIONS);
    expect(dropped).toHaveLength(allQuestions.length - MAX_REVIEW_QUESTIONS);
    expect(questions[0]!.risk).toBeGreaterThanOrEqual(questions.at(-1)!.risk);
  });

  it("turns dropped questions into explicit budget doubts", () => {
    const entities = Array.from({ length: 15 }, (_, index) =>
      entity(`entity-${String(index)}`, 0.5),
    );
    const allQuestions = selectReviewQuestions(entities, [], [], []);
    const { dropped } = capReviewQuestions(allQuestions);
    const doubts = reviewBudgetDoubts(dropped);

    expect(doubts).toHaveLength(dropped.length);
    expect(doubts.every((doubt) => doubt.reason.includes("Outside question budget"))).toBe(true);
  });
});
