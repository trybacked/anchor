import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyReviewLifecycle,
  buildAutoConfirmAuditEvents,
  buildReviewAuditEvents,
  canAdvanceLifecycle,
  publishSemanticModel,
  readPublicationRecord,
} from "../../src/index.js";
import type { Proposal } from "../../src/proposal.js";

const proposal: Proposal = {
  runId: "run-1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  entities: [
    {
      id: "orders",
      name: "Orders",
      sourceTable: "orders",
      status: "proposed",
      confidence: 0.95,
      provenance: { table: "orders", evidence: "test" },
      properties: [
        {
          name: "Id",
          columnName: "id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 0.95,
          provenance: { table: "orders", column: "id", evidence: "pk" },
        },
      ],
    },
    {
      id: "customers",
      name: "Customers",
      sourceTable: "customers",
      status: "proposed",
      confidence: 0.5,
      provenance: { table: "customers", evidence: "test" },
      properties: [
        {
          name: "Id",
          columnName: "id",
          semanticType: "identifier",
          role: "primary_key",
          nullable: false,
          confidence: 0.5,
          provenance: { table: "customers", column: "id", evidence: "pk" },
        },
      ],
    },
  ],
  relations: [],
  rules: [],
  questions: [
    {
      id: "q-customers",
      kind: "entity",
      targetId: "customers",
      question: "Is Customers an entity?",
      impact: 1,
      uncertainty: 0.8,
      risk: 0.8,
      evidence: { title: "Sample", columns: ["id"], rows: [["1"]] },
    },
  ],
  doubts: [],
};

describe("ontology lifecycle and audit", () => {
  it("advances lifecycle stages in order", () => {
    expect(canAdvanceLifecycle("discovered", "proposed")).toBe(true);
    expect(canAdvanceLifecycle("published", "confirmed")).toBe(false);
  });

  it("records human review and auto-confirm audit events", () => {
    const review = {
      runId: "run-1",
      answeredAt: new Date().toISOString(),
      reviewer: "tester",
      answers: [{ questionId: "q-customers", decision: "yes" as const }],
    };
    const humanEvents = buildReviewAuditEvents(proposal, review);
    expect(humanEvents).toHaveLength(1);
    expect(humanEvents[0]?.action).toBe("accept");
    expect(humanEvents[0]?.actor?.id).toBe("tester");

    const { ontology } = applyReviewLifecycle(proposal, review, { ontologyId: "demo" });
    expect(ontology.objects.find((object) => object.id === "customers")?.lifecycle).toBe(
      "reviewed",
    );
    expect(ontology.objects.find((object) => object.id === "orders")?.lifecycle).toBe("confirmed");

    const autoEvents = buildAutoConfirmAuditEvents(
      proposal,
      review,
      ontology.objects.map((object) => ({
        id: object.id,
        name: object.name,
        sourceTable: object.sourceDatasetId ?? object.id,
        status: "confirmed",
        confidence: object.id === "orders" ? 0.95 : 0.5,
        provenance: { table: object.id, evidence: "test" },
        properties: [],
      })),
      [],
      [],
    );
    expect(autoEvents.some((event) => event.action === "auto_confirm")).toBe(true);
  });

  it("publishes governed ontology with incremented version", () => {
    const review = {
      runId: "run-1",
      answeredAt: new Date().toISOString(),
      answers: [{ questionId: "q-customers", decision: "yes" as const }],
    };
    const { ontology } = applyReviewLifecycle(proposal, review, { ontologyId: "demo" });
    const model = {
      metadata: {
        formatVersion: "1" as const,
        runId: "run-1",
        generatedAt: new Date().toISOString(),
      },
      entities: proposal.entities.map((entity) => ({ ...entity, status: "confirmed" as const })),
      relations: [],
      rules: [],
    };
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "anchor-phase3-"));
    try {
      const first = publishSemanticModel(tmpRoot, model, { ontologyId: "demo", now: new Date() });
      expect(first.version).toBe(1);
      expect(first.ontology.objects.every((object) => object.lifecycle === "published")).toBe(true);
      const second = publishSemanticModel(tmpRoot, model, {
        ontologyId: "demo",
        now: new Date(Date.now() + 1000),
      });
      expect(second.version).toBe(2);
      expect(readPublicationRecord(tmpRoot)?.version).toBe(2);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
    void ontology;
  });
});
