import { describe, expect, it } from "vitest";
import type { Proposal } from "../../src/proposal.js";
import {
  EMPTY_AUDIT_LOG,
  buildPublishAuditEvent,
  buildReviewAuditEvents,
  buildRollbackAuditEvent,
  mergeAuditLogs,
} from "../../src/ontology/audit.js";
import {
  isGovernedLifecycleStage,
  lifecycleFromModelStatus,
  lifecycleStageIndex,
} from "../../src/ontology/lifecycle.js";

const proposal: Proposal = {
  runId: "run-1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  entities: [],
  relations: [],
  rules: [],
  doubts: [],
  questions: [
    {
      id: "q1",
      kind: "entity",
      targetId: "orders",
      question: "Keep Orders?",
      impact: 1,
      uncertainty: 0.3,
      risk: 0.3,
      evidence: { title: "t", columns: ["c"], rows: [["v"]] },
    },
  ],
};

describe("audit event builders", () => {
  it("maps review decisions to audit actions with reviewer and rename detail", () => {
    const events = buildReviewAuditEvents(proposal, {
      runId: "run-1",
      answeredAt: "2026-01-02T00:00:00.000Z",
      reviewer: "steward",
      answers: [{ questionId: "q1", decision: "rename", newName: "Sales Orders" }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "rename",
      elementId: "orders",
      actor: { id: "steward" },
      detail: { newName: "Sales Orders" },
      source: "human",
    });
  });

  it("skips answers for unknown questions", () => {
    const events = buildReviewAuditEvents(proposal, {
      runId: "run-1",
      answeredAt: "2026-01-02T00:00:00.000Z",
      answers: [{ questionId: "ghost", decision: "yes" }],
    });
    expect(events).toEqual([]);
  });

  it("builds publish and rollback events with actor", () => {
    const publish = buildPublishAuditEvent({
      runId: "run-1",
      recordedAt: "2026-01-02T00:00:00.000Z",
      publicationVersion: 3,
      actor: { id: "steward" },
    });
    expect(publish).toMatchObject({
      action: "publish",
      detail: { publicationVersion: 3 },
      actor: { id: "steward" },
    });

    const rollback = buildRollbackAuditEvent({
      runId: "run-1",
      recordedAt: "2026-01-02T00:00:00.000Z",
      fromVersion: 3,
      toVersion: 2,
    });
    expect(rollback).toMatchObject({
      action: "rollback",
      detail: { fromVersion: 3, toVersion: 2 },
    });
    expect(rollback.actor).toBeUndefined();
  });

  it("merges audit logs sorted by recording time", () => {
    const early = buildPublishAuditEvent({
      runId: "run-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
      publicationVersion: 1,
    });
    const late = buildRollbackAuditEvent({
      runId: "run-1",
      recordedAt: "2026-01-03T00:00:00.000Z",
      fromVersion: 1,
      toVersion: 1,
    });
    const merged = mergeAuditLogs({ version: 1, events: [late] }, EMPTY_AUDIT_LOG, {
      version: 1,
      events: [early],
    });
    expect(merged.events.map((event) => event.action)).toEqual(["publish", "rollback"]);
  });
});

describe("lifecycle helpers", () => {
  it("maps model statuses to lifecycle stages", () => {
    expect(lifecycleFromModelStatus("proposed")).toBe("proposed");
    expect(lifecycleFromModelStatus("confirmed")).toBe("confirmed");
    expect(lifecycleFromModelStatus("renamed")).toBe("confirmed");
  });

  it("orders stages and flags governed ones", () => {
    expect(lifecycleStageIndex("discovered")).toBeLessThan(lifecycleStageIndex("published"));
    expect(isGovernedLifecycleStage("confirmed")).toBe(true);
    expect(isGovernedLifecycleStage("discovered")).toBe(false);
  });
});
