import { createSageDecisionModel } from "@trybacked/infrastructure";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DECISION_POLICY } from "../../src/decision/decision-policy.js";
import { runOntologyProposal } from "../../src/pipeline.js";
import { fakeDatasetProvider, fakeOntologyLlm } from "./fixtures.js";
import { startMockSageServer, type MockSageServer } from "./mock-sage-server.js";

describe("Sage + AI proposal pipeline (e2e, mock Sage HTTP)", () => {
  let sage: MockSageServer;

  beforeEach(async () => {
    sage = await startMockSageServer();
  });

  afterEach(async () => {
    await sage.close();
  });

  it("calls Sage and attaches advisor verdicts to each applied change", async () => {
    const decisionModel = createSageDecisionModel({
      apiKey: "lv_test_e2e",
      baseUrl: sage.baseUrl,
      timeoutMs: 10_000,
      reasoning: "off",
    });

    const { proposal, invalidChanges } = await runOntologyProposal({
      provider: fakeDatasetProvider(),
      llm: fakeOntologyLlm() as never,
      tenantId: "tenant-e2e",
      runId: "run-e2e",
      proposalId: "prop-e2e",
      scope: { kind: "tenant" },
      decisionPolicy: DEFAULT_DECISION_POLICY,
      decisionModel,
    });

    expect(invalidChanges).toEqual([]);
    expect(proposal.changes).toHaveLength(1);
    expect(sage.requestCount()).toBe(1);
    expect(proposal.decisions).toHaveLength(1);
    const decision = proposal.decisions[0];
    expect(decision?.advisor?.modelId).toBe("mock-sage-e2e");
    expect(decision?.advisor?.accept.answer).toBe(true);
    expect(decision?.verdict).toBe("auto_approve");
  });

  it("routes to human_review when Sage returns null (undecided)", async () => {
    await sage.close();
    sage = await startMockSageServer({ acceptAnswer: null, acceptProbability: 0.51 });
    const decisionModel = createSageDecisionModel({
      apiKey: "lv_test_e2e",
      baseUrl: sage.baseUrl,
      timeoutMs: 10_000,
      reasoning: "off",
    });

    const { proposal } = await runOntologyProposal({
      provider: fakeDatasetProvider(),
      llm: fakeOntologyLlm() as never,
      tenantId: "tenant-e2e",
      runId: "run-e2e-2",
      proposalId: "prop-e2e-2",
      scope: { kind: "tenant" },
      decisionPolicy: DEFAULT_DECISION_POLICY,
      decisionModel,
    });

    expect(proposal.decisions[0]?.verdict).toBe("human_review");
    expect(proposal.decisions[0]?.reasons).toContain("undecided");
  });
});
