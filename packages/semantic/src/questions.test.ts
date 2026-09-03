import type { Entity, Relation, Rule } from "@backed/core";
import { describe, expect, it } from "vitest";

import { compressProfile } from "./compress.js";
import { selectReviewQuestions } from "./questions.js";
import { buildPmiProfile } from "./test-helpers.js";

function buildEntity(id: string, sourceTable: string, confidence: number): Entity {
  return {
    id,
    name: id,
    sourceTable,
    status: "proposed",
    confidence,
    provenance: { table: sourceTable, evidence: "test" },
    properties: [],
  };
}

function buildRelation(id: string, from: string, to: string, confidence: number): Relation {
  return {
    id,
    name: id,
    fromEntity: from,
    toEntity: to,
    fromColumn: "cliente_id",
    toColumn: "id",
    cardinality: "one_to_many",
    status: "proposed",
    confidence,
    provenance: { table: "fatture", column: "cliente_id", evidence: "test" },
  };
}

function buildRule(id: string, appliesTo: string, confidence: number): Rule {
  return {
    id,
    name: id,
    definition: "Definizione.",
    appliesTo,
    column: "stato",
    status: "proposed",
    confidence,
    provenance: { table: "fatture", column: "stato", evidence: "test" },
  };
}

const TABLES = compressProfile(buildPmiProfile());

describe("selectReviewQuestions", () => {
  it("orders by descending risk = impact × uncertainty", () => {
    // cliente: impact 2 (1 + relation), uncertainty 0.5 → risk 1.0
    // fattura: impact 3 (1 + relation + rule), uncertainty 0.1 → risk 0.3
    // relation: impact 2, uncertainty 0.4 → risk 0.8
    // rule: impact 1, uncertainty 0.2 → risk 0.2
    const questions = selectReviewQuestions(
      [buildEntity("cliente", "clienti", 0.5), buildEntity("fattura", "fatture", 0.9)],
      [buildRelation("fattura-cliente", "fattura", "cliente", 0.6)],
      [buildRule("insoluta", "fattura", 0.8)],
      TABLES,
    );

    expect(questions.map((q) => q.targetId)).toEqual([
      "cliente",
      "fattura-cliente",
      "fattura",
      "insoluta",
    ]);
    expect(questions[0]?.risk).toBeCloseTo(1.0);
    expect(questions[1]?.risk).toBeCloseTo(0.8);
  });

  it("includes every uncertain element, not a fixed cap", () => {
    const entities = Array.from({ length: 20 }, (_, index) =>
      buildEntity(`entity-${String(index)}`, "clienti", 0.5),
    );
    const questions = selectReviewQuestions(entities, [], [], TABLES);
    expect(questions).toHaveLength(20);
  });

  it("skips elements at or above the review confidence threshold", () => {
    const questions = selectReviewQuestions(
      [buildEntity("cliente", "clienti", 0.96), buildEntity("fattura", "fatture", 0.8)],
      [],
      [],
      TABLES,
      0.95,
    );
    expect(questions.map((q) => q.targetId)).toEqual(["fattura"]);
  });

  it("skips zero-risk elements (confidence 1)", () => {
    const questions = selectReviewQuestions([buildEntity("cliente", "clienti", 1)], [], [], TABLES);
    expect(questions).toHaveLength(0);
  });

  it("attaches profile evidence as a mini-table", () => {
    const questions = selectReviewQuestions(
      [],
      [],
      [buildRule("insoluta", "fattura", 0.7)],
      TABLES,
    );

    expect(questions[0]?.evidence.title).toContain("fatture.stato");
    expect(questions[0]?.evidence.rows.flat()).toContain("insoluta");
  });
});
