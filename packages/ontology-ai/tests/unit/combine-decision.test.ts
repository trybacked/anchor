import type { AuthoringCommandV2 } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { combineChangeDecision } from "../../src/decision/combine-decision.js";
import { DEFAULT_DECISION_POLICY } from "../../src/decision/decision-policy.js";
import { DEFAULT_REVIEW_POLICY } from "../../src/review-policy.js";

const addObjectCommand = {
  type: "addObjectType",
  objectType: { id: "x", name: "X", properties: [] },
} as never as AuthoringCommandV2;

const removeCommand = {
  type: "removeObjectType",
  objectTypeId: "x",
} as never as AuthoringCommandV2;

const baseInput = {
  changeId: "c1",
  command: addObjectCommand,
  confidence: 0.95,
  reviewPolicy: DEFAULT_REVIEW_POLICY,
  decisionPolicy: DEFAULT_DECISION_POLICY,
  decisionModelConfigured: true,
  contentTooLarge: false,
  advisorUnavailable: false,
};

describe("combineChangeDecision", () => {
  it("uses legacy auto_approve when Sage is not configured", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      decisionModelConfigured: false,
    });
    expect(decision.verdict).toBe("auto_approve");
  });

  it("forces human_review for breaking commands", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      command: removeCommand,
    });
    expect(decision.verdict).toBe("human_review");
    expect(decision.reasons).toContain("breaking");
  });

  it("routes undecided Sage answers to human_review", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      advisor: {
        modelId: "levanto-sage-v1.3",
        accept: { answer: null, probability: 0.51 },
        risks: {},
      },
    });
    expect(decision.verdict).toBe("human_review");
    expect(decision.reasons).toContain("undecided");
  });

  it("recommends reject on confident no", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      decisionPolicy: { ...DEFAULT_DECISION_POLICY, rejectThreshold: 0.8 },
      advisor: {
        modelId: "m",
        accept: { answer: false, probability: 0.9 },
        risks: {},
      },
    });
    expect(decision.verdict).toBe("recommend_reject");
  });

  it("blocks on risk tags", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      advisor: {
        modelId: "m",
        accept: { answer: true, probability: 0.99 },
        risks: { weak_evidence: { applies: true, probability: 0.91 } },
      },
    });
    expect(decision.verdict).toBe("human_review");
    expect(decision.reasons).toContain("risk:weak_evidence");
  });

  it("auto_approves when Sage and thresholds pass", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      decisionPolicy: { ...DEFAULT_DECISION_POLICY, acceptThreshold: 0.9 },
      advisor: {
        modelId: "m",
        accept: { answer: true, probability: 0.95 },
        risks: {},
      },
    });
    expect(decision.verdict).toBe("auto_approve");
  });

  it("keeps human_review when Sage is unsure but below reject threshold", () => {
    const decision = combineChangeDecision({
      ...baseInput,
      advisor: {
        modelId: "m",
        accept: { answer: true, probability: 0.7 },
        risks: {},
      },
    });
    expect(decision.verdict).toBe("human_review");
    expect(decision.reasons).toContain("needs_review");
  });
});
