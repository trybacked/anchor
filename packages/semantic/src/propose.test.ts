import { ProposalSchema } from "@backed/core";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { ColumnClassificationOutput, OntologyOutput } from "./llm-output.js";
import { proposeModel } from "./propose.js";
import { buildPmiProfile } from "./test-helpers.js";

function mockModel(object: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(object) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const CLASSIFICATION: ColumnClassificationOutput = {
  tables: [
    {
      table: "clienti",
      columns: [
        { column: "id", label: "Id cliente", semanticType: "identifier", role: "primary_key", confidence: 0.95 },
        { column: "ragione_sociale", label: "Ragione sociale", semanticType: "text", role: "attribute", confidence: 0.9 },
        { column: "partita_iva", label: "Partita IVA", semanticType: "vat_number", role: "attribute", confidence: 0.98 },
        { column: "email", label: "Email", semanticType: "email", role: "attribute", confidence: 0.97 },
      ],
    },
    {
      table: "fatture",
      columns: [
        { column: "numero", label: "Numero fattura", semanticType: "identifier", role: "primary_key", confidence: 0.9 },
        { column: "data", label: "Data emissione", semanticType: "date", role: "attribute", confidence: 0.95 },
        { column: "cliente_id", label: "Cliente", semanticType: "identifier", role: "foreign_key", confidence: 0.85 },
        { column: "importo", label: "Importo", semanticType: "amount", role: "attribute", confidence: 0.95 },
        { column: "stato", label: "Stato", semanticType: "category", role: "attribute", confidence: 0.9 },
      ],
    },
  ],
};

const ONTOLOGY: OntologyOutput = {
  entities: [
    {
      id: "cliente",
      name: "Cliente",
      description: "Anagrafica dei clienti.",
      sourceTable: "clienti",
      confidence: 0.95,
      evidence: "Colonne anagrafiche e partita IVA.",
    },
    {
      id: "fattura",
      name: "Fattura",
      description: "Fatture emesse.",
      sourceTable: "fatture",
      confidence: 0.9,
      evidence: "Numero progressivo, data, importo.",
    },
    {
      id: "magazzino",
      name: "Magazzino",
      description: "Entità inventata dal modello.",
      sourceTable: "magazzino",
      confidence: 0.8,
      evidence: "Nessuna.",
    },
  ],
  relations: [
    {
      id: "fattura-cliente",
      name: "Fattura emessa a Cliente",
      fromEntity: "fattura",
      toEntity: "cliente",
      fromColumn: "cliente_id",
      toColumn: "id",
      cardinality: "one_to_many",
      confidence: 0.5,
      evidence: "cliente_id riferisce clienti.id.",
    },
    {
      id: "fattura-magazzino",
      name: "Relazione non verificabile",
      fromEntity: "fattura",
      toEntity: "magazzino",
      fromColumn: "cliente_id",
      toColumn: "id",
      cardinality: "one_to_many",
      confidence: 0.4,
      evidence: "Nessuna.",
    },
  ],
  rules: [
    {
      id: "fattura-insoluta",
      name: "Fattura insoluta",
      definition: 'Una fattura è insoluta quando lo stato vale "insoluta".',
      appliesTo: "fattura",
      column: "stato",
      confidence: 0.6,
      evidence: "3 valori distinti in stato.",
    },
  ],
  doubts: [
    {
      topic: "valuta importi",
      question: "Gli importi sono in euro?",
      reason: "Il profilo non contiene informazioni sulla valuta.",
    },
  ],
};

async function runPropose(): Promise<ReturnType<typeof proposeModel>> {
  return proposeModel({
    profile: buildPmiProfile(),
    runId: "20260903T120000-test",
    models: { cheap: mockModel(CLASSIFICATION), frontier: mockModel(ONTOLOGY) },
    now: new Date("2026-09-03T12:00:00.000Z"),
  });
}

describe("proposeModel (mock models)", () => {
  it("produces a schema-valid proposal with assembled properties", async () => {
    const proposal = await runPropose();

    expect(() => ProposalSchema.parse(proposal)).not.toThrow();
    const cliente = proposal.entities.find((entity) => entity.id === "cliente");
    expect(cliente?.properties.map((property) => property.name)).toEqual([
      "Id cliente",
      "Ragione sociale",
      "Partita IVA",
      "Email",
    ]);
    expect(cliente?.properties[0]?.provenance).toEqual({
      table: "clienti",
      column: "id",
      evidence: expect.stringContaining("valori distinti") as unknown,
    });
    expect(proposal.usage).toEqual({ inputTokens: 200, outputTokens: 100, costUsd: null });
  });

  it("drops unverifiable entities and relations, surfacing them as doubts", async () => {
    const proposal = await runPropose();

    expect(proposal.entities.map((entity) => entity.id)).toEqual(["cliente", "fattura"]);
    expect(proposal.relations.map((relation) => relation.id)).toEqual(["fattura-cliente"]);
    expect(proposal.doubts.some((doubt) => doubt.topic === "entità magazzino")).toBe(true);
    expect(proposal.doubts.some((doubt) => doubt.topic === "relazione fattura-magazzino")).toBe(
      true,
    );
  });

  it("keeps the model's own doubts — 'non lo so' is valid output", async () => {
    const proposal = await runPropose();
    expect(proposal.doubts.some((doubt) => doubt.topic === "valuta importi")).toBe(true);
  });

  it("selects risk-ranked review questions with evidence", async () => {
    const proposal = await runPropose();

    expect(proposal.questions.length).toBeGreaterThan(0);
    expect(proposal.questions.length).toBeLessThanOrEqual(10);
    // Relation has confidence 0.5 and impact 2 → highest risk.
    expect(proposal.questions[0]?.targetId).toBe("fattura-cliente");
    for (const question of proposal.questions) {
      expect(question.evidence.rows.length).toBeGreaterThan(0);
    }
  });

  it("turns low-confidence proposals without a question into doubts", async () => {
    const proposal = await runPropose();
    const questionTargets = new Set(proposal.questions.map((question) => question.targetId));
    const rule = proposal.rules.find((r) => r.id === "fattura-insoluta");

    expect(rule?.confidence).toBeLessThan(0.7);
    if (!questionTargets.has("fattura-insoluta")) {
      expect(proposal.doubts.some((doubt) => doubt.topic === "rule fattura-insoluta")).toBe(true);
    }
  });
});
