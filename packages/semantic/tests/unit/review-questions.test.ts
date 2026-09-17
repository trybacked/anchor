import { describe, expect, it } from "vitest";
import { LOW_CONFIDENCE_THRESHOLD } from "@trybacked/core";
import type { Entity } from "@trybacked/core";
import { selectReviewQuestions } from "../../src/questions.js";

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

describe("selectReviewQuestions", () => {
  it("includes every low-confidence element with no cap", () => {
    const entities = Array.from({ length: 15 }, (_, index) =>
      entity(`entity-${String(index)}`, 0.5),
    );
    const questions = selectReviewQuestions(entities, [], [], []);
    expect(questions).toHaveLength(15);
  });

  it("skips elements at or above LOW_CONFIDENCE_THRESHOLD", () => {
    const entities = [
      entity("sure", LOW_CONFIDENCE_THRESHOLD),
      entity("borderline", LOW_CONFIDENCE_THRESHOLD - 0.01),
      entity("uncertain", 0.4),
    ];
    const questions = selectReviewQuestions(entities, [], [], []);
    expect(questions.map((question) => question.targetId).sort()).toEqual([
      "borderline",
      "uncertain",
    ]);
    expect(questions.some((question) => question.targetId === "sure")).toBe(false);
  });

  it("sorts by descending risk", () => {
    const entities = [entity("low-risk", 0.69), entity("high-risk", 0.2)];
    const questions = selectReviewQuestions(entities, [], [], []);
    expect(questions[0]?.targetId).toBe("high-risk");
    expect(questions.at(-1)?.targetId).toBe("low-risk");
  });
});
