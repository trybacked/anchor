import { describe, expect, it } from "vitest";

import { parseModelYaml, serializeModelYaml } from "./artifacts.js";
import type { Entity, Relation, Rule, SemanticModel } from "./model.js";
import type { Proposal } from "./proposal.js";
import { applyReview } from "./review.js";
import type { Review } from "./review.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");

function buildEntity(id: string, sourceTable: string): Entity {
  return {
    id,
    name: id,
    sourceTable,
    status: "proposed",
    confidence: 0.9,
    provenance: { table: sourceTable, evidence: "test evidence" },
    properties: [
      {
        name: "Id",
        columnName: "id",
        semanticType: "identifier",
        role: "primary_key",
        nullable: false,
        confidence: 0.95,
        provenance: { table: sourceTable, column: "id", evidence: "distinct = row count" },
      },
    ],
  };
}

function buildRelation(id: string, fromEntity: string, toEntity: string): Relation {
  return {
    id,
    name: `${fromEntity} → ${toEntity}`,
    fromEntity,
    toEntity,
    fromColumn: `${toEntity}_id`,
    toColumn: "id",
    cardinality: "one_to_many",
    status: "proposed",
    confidence: 0.8,
    provenance: { table: fromEntity, column: `${toEntity}_id`, evidence: "value overlap" },
  };
}

function buildRule(id: string, appliesTo: string): Rule {
  return {
    id,
    name: id,
    definition: "Definizione di test.",
    appliesTo,
    status: "proposed",
    confidence: 0.6,
    provenance: { table: appliesTo, evidence: "low cardinality column" },
  };
}

function buildProposal(): Proposal {
  return {
    runId: "20260903T120000-test",
    generatedAt: NOW.toISOString(),
    entities: [buildEntity("cliente", "clienti"), buildEntity("fattura", "fatture")],
    relations: [buildRelation("fattura-cliente", "fattura", "cliente")],
    rules: [buildRule("fattura-insoluta", "fattura")],
    doubts: [],
    questions: [
      {
        id: "q1",
        kind: "entity",
        targetId: "fattura",
        question: "La tabella fatture rappresenta le fatture emesse?",
        impact: 3,
        uncertainty: 0.2,
        risk: 0.6,
        evidence: { title: "fatture", columns: ["colonna"], rows: [["numero"]] },
      },
      {
        id: "q2",
        kind: "relation",
        targetId: "fattura-cliente",
        question: "Ogni fattura appartiene a un cliente?",
        impact: 2,
        uncertainty: 0.2,
        risk: 0.4,
        evidence: { title: "fatture", columns: ["colonna"], rows: [["cliente_id"]] },
      },
      {
        id: "q3",
        kind: "rule",
        targetId: "fattura-insoluta",
        question: "Una fattura con stato 'insoluta' è da considerare non pagata?",
        impact: 1,
        uncertainty: 0.4,
        risk: 0.4,
        evidence: { title: "fatture.stato", columns: ["valore"], rows: [["insoluta"]] },
      },
    ],
  };
}

function buildReview(answers: Review["answers"]): Review {
  return { runId: "20260903T120000-test", answeredAt: NOW.toISOString(), answers };
}

describe("applyReview", () => {
  it("confirms elements answered 'yes' and leaves the rest proposed", () => {
    const model = applyReview(
      buildProposal(),
      buildReview([{ questionId: "q1", decision: "yes" }]),
      NOW,
    );

    expect(model.entities.find((e) => e.id === "fattura")?.status).toBe("confirmed");
    expect(model.entities.find((e) => e.id === "cliente")?.status).toBe("proposed");
    expect(model.relations).toHaveLength(1);
    expect(model.rules).toHaveLength(1);
  });

  it("renames the target and marks it renamed", () => {
    const model = applyReview(
      buildProposal(),
      buildReview([{ questionId: "q1", decision: "rename", newName: "Fattura di vendita" }]),
      NOW,
    );

    const fattura = model.entities.find((e) => e.id === "fattura");
    expect(fattura?.name).toBe("Fattura di vendita");
    expect(fattura?.status).toBe("renamed");
  });

  it("drops rejected entities together with dependent relations and rules", () => {
    const model = applyReview(
      buildProposal(),
      buildReview([{ questionId: "q1", decision: "no" }]),
      NOW,
    );

    expect(model.entities.map((e) => e.id)).toEqual(["cliente"]);
    expect(model.relations).toHaveLength(0);
    expect(model.rules).toHaveLength(0);
  });

  it("drops a rejected relation without touching its entities", () => {
    const model = applyReview(
      buildProposal(),
      buildReview([{ questionId: "q2", decision: "no" }]),
      NOW,
    );

    expect(model.entities).toHaveLength(2);
    expect(model.relations).toHaveLength(0);
    expect(model.rules).toHaveLength(1);
  });
});

describe("modello.yaml serialization", () => {
  it("round-trips a model through YAML without loss", () => {
    const model: SemanticModel = applyReview(
      buildProposal(),
      buildReview([
        { questionId: "q1", decision: "yes" },
        { questionId: "q3", decision: "rename", newName: "Insoluto" },
      ]),
      NOW,
    );

    const parsed = parseModelYaml(serializeModelYaml(model));
    expect(parsed).toEqual(model);
  });

  it("rejects YAML that violates the schema", () => {
    expect(() => parseModelYaml("metadata: {}\nentities: []")).toThrow();
  });
});
