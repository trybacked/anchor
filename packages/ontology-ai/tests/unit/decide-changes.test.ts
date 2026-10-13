import type { AuthoringCommandV2, OntologyV2 } from "@trybacked/core";
import type { DecisionBatchResult, DecisionModel } from "@trybacked/ports";
import { DecisionModelUnavailableError } from "@trybacked/ports";
import { describe, expect, it } from "vitest";
import { decideProposalChanges } from "../../src/decision/decide-changes.js";
import { DEFAULT_DECISION_POLICY } from "../../src/decision/decision-policy.js";
import { DEFAULT_REVIEW_POLICY } from "../../src/review-policy.js";

const emptyOntology: OntologyV2 = {
  metadata: { id: "t", formatVersion: "2", version: 0 },
  objectTypes: [],
  valueTypes: [],
  interfaces: [],
  linkTypes: [],
  actionTypes: [],
};

const nonBreakingChange = {
  id: "c1",
  command: {
    type: "addObjectType",
    objectType: { id: "contract", name: "Contract", properties: [] },
  } as never as AuthoringCommandV2,
  confidence: 0.95,
  rationale: "sample rationale",
  evidence: [],
};

function fakeModel(batch: DecisionBatchResult): DecisionModel {
  return {
    decideBatch: async () => batch,
  };
}

describe("decideProposalChanges", () => {
  it("skips Sage for breaking commands", async () => {
    const decisions = await decideProposalChanges({
      changes: [
        {
          ...nonBreakingChange,
          command: { type: "removeObjectType", objectTypeId: "x" } as never as AuthoringCommandV2,
        },
      ],
      baselineOntology: emptyOntology,
      reviewPolicy: DEFAULT_REVIEW_POLICY,
      decisionPolicy: DEFAULT_DECISION_POLICY,
      decisionModel: fakeModel({
        modelId: "m",
        groups: [],
        usage: { inputTokens: 0, outputTokens: 0, searches: 0 },
      }),
    });
    expect(decisions[0]?.verdict).toBe("human_review");
    expect(decisions[0]?.reasons).toContain("breaking");
  });

  it("fail-closes when Sage is unavailable", async () => {
    const failingModel: DecisionModel = {
      decideBatch: async () => {
        throw new DecisionModelUnavailableError("quota");
      },
    };
    const decisions = await decideProposalChanges({
      changes: [nonBreakingChange],
      baselineOntology: emptyOntology,
      reviewPolicy: DEFAULT_REVIEW_POLICY,
      decisionPolicy: DEFAULT_DECISION_POLICY,
      decisionModel: failingModel,
    });
    expect(decisions[0]?.verdict).toBe("human_review");
    expect(decisions[0]?.reasons).toContain("decision_unavailable");
  });

  it("matches legacy behavior without a decision model", async () => {
    const decisions = await decideProposalChanges({
      changes: [nonBreakingChange],
      baselineOntology: emptyOntology,
      reviewPolicy: DEFAULT_REVIEW_POLICY,
      decisionPolicy: DEFAULT_DECISION_POLICY,
    });
    expect(decisions[0]?.verdict).toBe("auto_approve");
  });
});
